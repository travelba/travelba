/**
 * Journal d’agence : masque, chaîne de hash, CSV.
 * Le hash est le même calcul que le trigger Postgres (SHA-256 de prev|canonical, UTF-8).
 * Aucun secret n’entre dans le résumé ni dans le diff.
 */

const SECRET_KEY = /password|secret|token|api[_-]?key|authorization|cvv|cvc|pan|card_number|hashed|service_role/i;
const KEEP_LAST_KEY = /passport|document_number|mrz|personal_number|iban|card_last|card_number/i;
const LONG_DIGITS = /^[0-9]{13,19}$/;

export const JOURNAL_ACTIONS = [
  "view",
  "create",
  "update",
  "delete",
  "send",
  "export",
  "login",
  "logout",
  "login_failed",
  "reveal",
] as const;

export type JournalAction = (typeof JOURNAL_ACTIONS)[number];

export const JOURNAL_ENTITIES = [
  "dossier",
  "client",
  "card",
  "message",
  "setting",
  "user",
  "finance",
  "document",
  "session",
] as const;

export type JournalEntity = (typeof JOURNAL_ENTITIES)[number];

export const JOURNAL_ACTION_LABELS: Record<JournalAction, string> = {
  view: "Consultation",
  create: "Création",
  update: "Modification",
  delete: "Archivage",
  send: "Envoi",
  export: "Export",
  login: "Connexion",
  logout: "Déconnexion",
  login_failed: "Connexion refusée",
  reveal: "Révélation",
};

export const JOURNAL_ENTITY_LABELS: Record<JournalEntity, string> = {
  dossier: "Dossier",
  client: "Client",
  card: "Carte",
  message: "Message",
  setting: "Réglage",
  user: "Utilisateur",
  finance: "Finance",
  document: "Pièce",
  session: "Session",
};

export function maskKeepLast(value: string, keep = 3) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.length <= keep) return "•".repeat(trimmed.length);
  return `${"•".repeat(trimmed.length - keep)}${trimmed.slice(-keep)}`;
}

export function maskJournalValue(key: string, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskJournalValue(key, item));
  if (value && typeof value === "object") return maskJournalTree(value as Record<string, unknown>);
  if (typeof value !== "string" && typeof value !== "number") return value;
  const text = String(value);
  if (SECRET_KEY.test(key)) return "[masqué]";
  if (KEEP_LAST_KEY.test(key) || LONG_DIGITS.test(text)) return maskKeepLast(text);
  return value;
}

export function maskJournalTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskJournalTree(item));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    next[key] = maskJournalValue(key, item);
  }
  return next;
}

/**
 * Même calcul que le trigger `crm_private.seal_agency_journal` : les anciens champs d’abord, puis l’étiquette
 * métier, le dossier, le montant, la devise, les quatre chiffres et l’auteur hors équipe. Une ligne écrite avant
 * ces colonnes garde son canonical stocké : la chaîne se vérifie toujours ligne à ligne.
 */
export function journalCanonical(input: {
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  diff: unknown;
  kind?: string | null;
  bookingId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  cardLast4?: string | null;
  actorLabel?: string | null;
}) {
  const diff = input.diff == null ? "" : JSON.stringify(input.diff);
  return [
    input.action,
    input.entityType,
    input.entityId ?? "",
    input.summary,
    diff,
    input.kind ?? "",
    input.bookingId ?? "",
    input.amountCents == null ? "" : String(input.amountCents),
    input.currency ?? "",
    input.cardLast4 ?? "",
    input.actorLabel ?? "",
  ].join("|");
}

export async function journalRowHash(prev: string | null, canonical: string) {
  const data = new TextEncoder().encode(`${prev ?? ""}|${canonical}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function journalChainIntact(
  rows: readonly { prev_hash: string | null; row_hash: string; canonical: string }[]
) {
  let prev: string | null = null;
  for (const row of rows) {
    if ((row.prev_hash ?? null) !== prev) return false;
    const hash = await journalRowHash(prev, row.canonical);
    if (hash !== row.row_hash) return false;
    prev = row.row_hash;
  }
  return true;
}

/** Chaque ligne colle à son prev_hash stocké. Une tranche filtrée n’a pas à commencer à zéro. */
export async function journalRowsMatch(
  rows: readonly { prev_hash: string | null; row_hash: string; canonical: string }[]
) {
  for (const row of rows) {
    const hash = await journalRowHash(row.prev_hash, row.canonical);
    if (hash !== row.row_hash) return false;
  }
  return true;
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function journalCsv(
  rows: readonly {
    occurred_at: string;
    actor: string;
    action: string;
    entity_type: string;
    entity_id: string;
    summary: string;
  }[]
) {
  const header = ["Quand", "Qui", "Action", "Entité", "Identifiant", "Résumé"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [row.occurred_at, row.actor, row.action, row.entity_type, row.entity_id, row.summary]
        .map((cell) => csvCell(cell))
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function auditSummary(action: JournalAction, entity: JournalEntity) {
  return `${JOURNAL_ACTION_LABELS[action]} · ${JOURNAL_ENTITY_LABELS[entity]}`;
}

export type JournalDiffLine = { key: string; label: string; before: string | null; after: string };

function diffScalar(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => diffScalar(item)).join(", ");
  return JSON.stringify(value);
}

function diffLabel(key: string) {
  return key.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

/**
 * Le diff d’une ligne, lisible : `{ champ: { avant, apres } }` devient « Champ : avant → après » ;
 * une valeur simple devient « Champ : valeur ». Le diff a déjà été masqué à l’écriture.
 */
export function journalDiffLines(diff: unknown): JournalDiffLine[] {
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return [];
  const lines: JournalDiffLine[] = [];
  for (const [key, value] of Object.entries(diff as Record<string, unknown>)) {
    if (key === "masked") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const pair = value as Record<string, unknown>;
      const hasBefore = "avant" in pair || "before" in pair || "from" in pair;
      const hasAfter = "apres" in pair || "after" in pair || "to" in pair;
      if (hasBefore || hasAfter) {
        lines.push({
          key,
          label: diffLabel(key),
          before: hasBefore ? diffScalar(pair.avant ?? pair.before ?? pair.from) : null,
          after: diffScalar(pair.apres ?? pair.after ?? pair.to),
        });
        continue;
      }
    }
    lines.push({ key, label: diffLabel(key), before: null, after: diffScalar(value) });
  }
  return lines.slice(0, 12);
}
