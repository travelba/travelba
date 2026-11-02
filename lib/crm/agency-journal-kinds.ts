/**
 * Vocabulaire métier du journal d’agence. Pur : étiquettes, familles, icônes, phrases, heure de Paris.
 * Une ligne porte une étiquette (`kind`) ; une ligne ancienne sans étiquette est rangée d’après son action
 * et son entité. Les cartes sont en rouge, les paiements et les fournisseurs en orange : on les repère d’un coup d’œil.
 * Aucun numéro complet n’entre ici : seulement quatre chiffres et un montant.
 */

import type { JournalAction, JournalEntity } from "./agency-journal";

export const JOURNAL_FAMILIES = [
  "dossier",
  "option",
  "carte",
  "paiement",
  "fournisseur",
  "email",
  "responsable",
  "client",
  "acces",
] as const;

export type JournalFamily = (typeof JOURNAL_FAMILIES)[number];

export const JOURNAL_FAMILY_LABELS: Record<JournalFamily, string> = {
  dossier: "Dossier",
  option: "Option",
  carte: "Carte",
  paiement: "Paiement",
  fournisseur: "Fournisseur",
  email: "E-mail",
  responsable: "Responsable",
  client: "Client",
  acces: "Accès",
};

export type JournalTone = "neutral" | "accent" | "danger" | "warning" | "success";

export const JOURNAL_FAMILY_TONE: Record<JournalFamily, JournalTone> = {
  dossier: "neutral",
  option: "accent",
  carte: "danger",
  paiement: "warning",
  fournisseur: "warning",
  email: "neutral",
  responsable: "success",
  client: "neutral",
  acces: "neutral",
};

/** Noms d’icônes de `components/crm/icons.tsx`. */
export const JOURNAL_FAMILY_ICON: Record<JournalFamily, string> = {
  dossier: "luggage",
  option: "bed",
  carte: "credit_card",
  paiement: "payments",
  fournisseur: "receipt_long",
  email: "mail",
  responsable: "user_cog",
  client: "person",
  acces: "lock",
};

/** Familles « cartes et paiements » : le filtre sensible de la page Activité. */
export const SENSITIVE_FAMILIES: readonly JournalFamily[] = ["carte", "paiement", "fournisseur"];

type KindDef = { label: string; family: JournalFamily; icon?: string };

export const JOURNAL_KIND_DEFS = {
  dossier_cree: { label: "Dossier créé", family: "dossier", icon: "add" },
  dossier_modifie: { label: "Dossier modifié", family: "dossier" },
  dossier_archive: { label: "Dossier archivé", family: "dossier", icon: "archive" },
  dossier_restaure: { label: "Dossier restauré", family: "dossier", icon: "unarchive" },
  dossier_duplique: { label: "Dossier dupliqué", family: "dossier", icon: "content_copy" },
  carnet_montre: { label: "Carnet montré au client", family: "dossier", icon: "eye" },
  etape_ajoutee: { label: "Étape ajoutée", family: "dossier", icon: "add" },
  etape_modifiee: { label: "Étape modifiée", family: "dossier" },
  etape_retiree: { label: "Étape retirée", family: "dossier", icon: "minus" },
  piece_deposee: { label: "Pièce déposée", family: "dossier", icon: "description" },
  piece_retiree: { label: "Pièce retirée", family: "dossier", icon: "description" },
  voyageurs_modifies: { label: "Voyageurs modifiés", family: "dossier", icon: "group" },
  formalite: { label: "Formalité", family: "dossier", icon: "shield_check" },
  option_posee: { label: "Option posée", family: "option", icon: "add" },
  option_levee: { label: "Option levée", family: "option", icon: "check" },
  option_annulee: { label: "Option annulée", family: "option", icon: "close" },
  carte_emise: { label: "Carte émise", family: "carte" },
  carte_ouverte: { label: "Carte ouverte", family: "carte", icon: "eye" },
  carte_bloquee: { label: "Carte bloquée", family: "carte", icon: "lock" },
  carte_debloquee: { label: "Carte débloquée", family: "carte" },
  carte_cloturee: { label: "Carte clôturée", family: "carte", icon: "close" },
  carte_plafond: { label: "Plafond modifié", family: "carte" },
  carte_utilisee: { label: "Carte utilisée", family: "carte" },
  paiement_recu: { label: "Paiement reçu", family: "paiement", icon: "south_west" },
  paiement_rapproche: { label: "Paiement rapproché", family: "paiement", icon: "sync_alt" },
  paiement_refuse: { label: "Paiement écarté", family: "paiement", icon: "close" },
  remboursement: { label: "Remboursement", family: "paiement" },
  fournisseur_paye: { label: "Fournisseur payé", family: "fournisseur" },
  depense_hors_voyage: { label: "Dépense hors voyage", family: "fournisseur" },
  email_envoye: { label: "E-mail envoyé", family: "email" },
  whatsapp_envoye: { label: "WhatsApp envoyé", family: "email", icon: "chat" },
  message_envoye: { label: "Message envoyé", family: "email", icon: "forum" },
  responsable_attribue: { label: "Dossier attribué", family: "responsable" },
  dossier_pris: { label: "Dossier pris en charge", family: "responsable", icon: "check" },
  dossier_a_prendre: { label: "Dossier remis à prendre", family: "responsable" },
  client_cree: { label: "Client créé", family: "client", icon: "person_add" },
  client_modifie: { label: "Client modifié", family: "client" },
  client_archive: { label: "Client archivé", family: "client", icon: "archive" },
  passeport_ouvert: { label: "Passeport ouvert", family: "acces", icon: "id_card" },
  connexion: { label: "Connexion", family: "acces" },
  connexion_refusee: { label: "Connexion refusée", family: "acces", icon: "close" },
  deconnexion: { label: "Déconnexion", family: "acces", icon: "logout" },
  export: { label: "Export", family: "acces", icon: "download" },
  reglage_modifie: { label: "Réglage modifié", family: "acces", icon: "build" },
  equipe_modifiee: { label: "Équipe modifiée", family: "acces", icon: "user_cog" },
  autre: { label: "Autre", family: "acces" },
} as const satisfies Record<string, KindDef>;

export type JournalKind = keyof typeof JOURNAL_KIND_DEFS;

export const JOURNAL_KINDS = Object.keys(JOURNAL_KIND_DEFS) as JournalKind[];

export function isJournalKind(value: unknown): value is JournalKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(JOURNAL_KIND_DEFS, value);
}

export function isJournalFamily(value: unknown): value is JournalFamily {
  return typeof value === "string" && (JOURNAL_FAMILIES as readonly string[]).includes(value);
}

export function journalKindLabel(kind: JournalKind) {
  return JOURNAL_KIND_DEFS[kind].label;
}

export type JournalRowLike = {
  kind?: string | null;
  action: JournalAction | string;
  entity_type: JournalEntity | string;
};

/** Étiquette d’une ligne. Une ligne ancienne sans étiquette est rangée d’après son action et son entité. */
export function journalKindOf(row: JournalRowLike): JournalKind {
  if (isJournalKind(row.kind)) return row.kind;
  const { action, entity_type: entity } = row;
  if (action === "login") return "connexion";
  if (action === "login_failed") return "connexion_refusee";
  if (action === "logout") return "deconnexion";
  if (action === "export") return "export";
  if (action === "reveal") return entity === "card" ? "carte_ouverte" : "passeport_ouvert";
  if (entity === "card") return action === "create" ? "carte_emise" : "carte_plafond";
  if (entity === "finance") return action === "create" ? "paiement_recu" : "paiement_rapproche";
  if (entity === "message") return "message_envoye";
  if (entity === "client") return action === "create" ? "client_cree" : action === "delete" ? "client_archive" : "client_modifie";
  if (entity === "dossier") return action === "create" ? "dossier_cree" : action === "delete" ? "dossier_archive" : "dossier_modifie";
  if (entity === "document") return action === "delete" ? "piece_retiree" : "piece_deposee";
  if (entity === "user") return "equipe_modifiee";
  if (entity === "setting") return "reglage_modifie";
  return "autre";
}

export function journalFamilyOf(row: JournalRowLike): JournalFamily {
  return JOURNAL_KIND_DEFS[journalKindOf(row)].family;
}

export function journalIconOf(row: JournalRowLike): string {
  const kind = journalKindOf(row);
  const def: KindDef = JOURNAL_KIND_DEFS[kind];
  return def.icon || JOURNAL_FAMILY_ICON[def.family];
}

export function journalToneOf(row: JournalRowLike): JournalTone {
  return JOURNAL_FAMILY_TONE[journalFamilyOf(row)];
}

/** Cartes, paiements et fournisseurs : les lignes du filtre « cartes et paiements seulement ». */
export function journalIsSensitive(row: JournalRowLike) {
  return SENSITIVE_FAMILIES.includes(journalFamilyOf(row));
}

/* ---------- Montants et cartes ---------- */

/** « 2 450 € », « 1 234,50 € », « 180 USD ». Null sans montant. */
export function formatJournalAmount(amountCents: number | null | undefined, currency?: string | null) {
  if (amountCents == null || !Number.isFinite(amountCents)) return null;
  const abs = Math.abs(amountCents);
  const euros = abs / 100;
  const whole = abs % 100 === 0;
  // Espaces insécables ordinaires (U+00A0) : fr-FR sort des fines (U+202F) selon la version d’ICU.
  const number = euros
    .toLocaleString("fr-FR", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
    .replace(/[\u202f\u00a0 ]/g, "\u00a0");
  const code = (currency || "EUR").toUpperCase();
  return code === "EUR" ? `${number}\u00a0€` : `${number}\u00a0${code}`;
}

/** « •••• 4821 ». Jamais plus de quatre chiffres : un numéro plus long est refusé. */
export function maskedCard(last4: string | null | undefined) {
  if (!last4) return null;
  const digits = last4.replace(/\D/g, "");
  if (digits.length !== 4) return null;
  return `•••• ${digits}`;
}

/** Quatre derniers chiffres d’un numéro masqué ou complet (« •••• 4821 », « 4821 »). Jamais le numéro entier. */
export function cardLast4Of(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/** Centimes depuis des euros (nombre ou texte « 2 450,00 »). Null si illisible. */
export function centsFromAmount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s|€/g, "").replace(",", ".");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export type JournalPhraseInput = {
  summary: string;
  amount_cents?: number | null;
  currency?: string | null;
  card_last4?: string | null;
};

/**
 * La phrase affichée : le résumé, complété du montant et de la carte quand ils n’y sont pas déjà.
 * « Option posée au Negresco » + 245000 → « Option posée au Negresco, 2 450 € ».
 */
export function journalPhrase(row: JournalPhraseInput) {
  let text = (row.summary || "").trim().replace(/\.$/, "");
  const card = maskedCard(row.card_last4);
  if (card && !text.includes(card.slice(-4))) text = `${text} ${card}`;
  const amount = formatJournalAmount(row.amount_cents, row.currency);
  if (amount && !text.includes(amount)) text = `${text}, ${amount}`;
  return text;
}

/* ---------- Auteur ---------- */

export type JournalAuthorInput = {
  staff_id?: string | null;
  actor?: string | null;
  actor_label?: string | null;
};

/** « Marie », « connecteur grok », sinon « Agence ». */
export function journalAuthor(row: JournalAuthorInput) {
  if (row.staff_id && row.actor) return row.actor;
  if (row.actor_label) return row.actor_label.startsWith("connecteur") ? row.actor_label : `connecteur ${row.actor_label}`;
  return row.actor || "Agence";
}

export function agentInitials(name: string | null | undefined) {
  const parts = (name || "").trim().split(/[\s-]+/).filter(Boolean);
  if (!parts.length) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const AGENT_PALETTE = [
  { bg: "#0B192C", fg: "#FFFFFF" },
  { bg: "#C5A880", fg: "#0B192C" },
  { bg: "#2F6F73", fg: "#FFFFFF" },
  { bg: "#8A4B3C", fg: "#FFFFFF" },
  { bg: "#5B5F97", fg: "#FFFFFF" },
  { bg: "#4F7942", fg: "#FFFFFF" },
  { bg: "#B5651D", fg: "#FFFFFF" },
  { bg: "#6D597A", fg: "#FFFFFF" },
] as const;

/** Couleur stable par collègue : la même d’un écran à l’autre. */
export function agentColor(key: string | null | undefined) {
  const text = key || "";
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return AGENT_PALETTE[hash % AGENT_PALETTE.length];
}

/* ---------- Heure de Paris ---------- */

export const AGENCY_TIME_ZONE = "Europe/Paris";

function parisParts(date: Date, timeZone = AGENCY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), weekday: get("weekday") };
}

/** « 2026-10-30 » : le jour à Paris, pour grouper la frise. */
export function journalDayKey(iso: string, timeZone = AGENCY_TIME_ZONE) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { year, month, day } = parisParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

/** « 14h32 ». */
export function journalClock(iso: string, timeZone = AGENCY_TIME_ZONE) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { hour, minute } = parisParts(date, timeZone);
  return `${hour}h${minute}`;
}

/** « 30/10 à 14h32 » : ce qui se lit sous chaque action. */
export function journalWhen(iso: string, timeZone = AGENCY_TIME_ZONE) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { day, month, hour, minute } = parisParts(date, timeZone);
  return `${day}/${month} à ${hour}h${minute}`;
}

/** « par Marie · 30/10 à 14h32 ». */
export function journalByline(author: string, iso: string, timeZone = AGENCY_TIME_ZONE) {
  return `par ${author} · ${journalWhen(iso, timeZone)}`;
}

/** Titre d’un jour de la frise : « Aujourd’hui », « Hier », sinon « jeu. 29/10 ». */
export function journalDayTitle(dayKey: string, now = new Date(), timeZone = AGENCY_TIME_ZONE) {
  const today = journalDayKey(now.toISOString(), timeZone);
  if (dayKey === today) return "Aujourd’hui";
  const yesterday = journalDayKey(new Date(now.getTime() - 24 * 3600 * 1000).toISOString(), timeZone);
  if (dayKey === yesterday) return "Hier";
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(date);
  return `${weekday} ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

function offsetMinutes(date: Date, timeZone: string) {
  const text = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = text.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

/** Minuit à Paris du jour de `now`, en instant UTC. */
export function parisStartOfDay(now = new Date(), timeZone = AGENCY_TIME_ZONE) {
  const { year, month, day } = parisParts(now, timeZone);
  const guess = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const offset = offsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60_000);
}

/** Lundi 00:00 à Paris de la semaine de `now`. */
export function parisStartOfWeek(now = new Date(), timeZone = AGENCY_TIME_ZONE) {
  const start = parisStartOfDay(now, timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(start);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const back = index < 0 ? 0 : index;
  return parisStartOfDay(new Date(start.getTime() - back * 24 * 3600 * 1000 + 12 * 3600 * 1000), timeZone);
}

export const ACTIVITY_PERIODS = ["jour", "semaine", "mois"] as const;
export type ActivityPeriod = (typeof ACTIVITY_PERIODS)[number];

export const ACTIVITY_PERIOD_LABELS: Record<ActivityPeriod, string> = {
  jour: "Aujourd’hui",
  semaine: "Cette semaine",
  mois: "30 jours",
};

export function isActivityPeriod(value: unknown): value is ActivityPeriod {
  return typeof value === "string" && (ACTIVITY_PERIODS as readonly string[]).includes(value);
}

/** Début de la période, en instant UTC. */
export function activityPeriodStart(period: ActivityPeriod, now = new Date(), timeZone = AGENCY_TIME_ZONE) {
  if (period === "jour") return parisStartOfDay(now, timeZone);
  if (period === "semaine") return parisStartOfWeek(now, timeZone);
  return parisStartOfDay(new Date(now.getTime() - 29 * 24 * 3600 * 1000), timeZone);
}

/* ---------- Filtres et regroupements ---------- */

export type JournalFeedRow = JournalRowLike &
  JournalPhraseInput &
  JournalAuthorInput & {
    seq: number;
    occurred_at: string;
    entity_id?: string | null;
    booking_id?: string | null;
  };

export type JournalFilters = {
  family?: JournalFamily | "tous" | "" | null;
  staffId?: string | "" | null;
  sensitiveOnly?: boolean;
  bookingId?: string | "" | null;
};

export function filterJournalRows<T extends JournalFeedRow>(rows: readonly T[], filters: JournalFilters): T[] {
  return rows.filter((row) => {
    if (filters.family && filters.family !== "tous" && journalFamilyOf(row) !== filters.family) return false;
    if (filters.staffId && row.staff_id !== filters.staffId) return false;
    if (filters.sensitiveOnly && !journalIsSensitive(row)) return false;
    if (filters.bookingId && row.booking_id !== filters.bookingId && row.entity_id !== filters.bookingId) return false;
    return true;
  });
}

/** Lignes groupées par jour de Paris, du plus récent au plus ancien. */
export function groupJournalByDay<T extends { occurred_at: string }>(rows: readonly T[], timeZone = AGENCY_TIME_ZONE) {
  const groups: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const day = journalDayKey(row.occurred_at, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  return groups;
}

/** Familles présentes dans une liste, dans l’ordre du vocabulaire : les filtres n’offrent que ce qui existe. */
export function familiesPresent(rows: readonly JournalRowLike[]): JournalFamily[] {
  const present = new Set(rows.map((row) => journalFamilyOf(row)));
  return JOURNAL_FAMILIES.filter((family) => present.has(family));
}

/* ---------- Champs écrits en base ---------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type JournalBusinessInput = {
  staffId?: string | null;
  kind?: string | null;
  bookingId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  cardLast4?: string | null;
  actorLabel?: string | null;
};

/** Les champs métier, propres : null plutôt qu’une valeur douteuse. Jamais plus de quatre chiffres de carte. */
export function journalBusinessFields(entry: JournalBusinessInput) {
  const amount = entry.amountCents;
  const hasAmount = amount != null && Number.isFinite(amount);
  const currency = (entry.currency || "").trim().toUpperCase();
  const actor = (entry.actorLabel || "").trim().slice(0, 80);
  return {
    kind: isJournalKind(entry.kind) ? entry.kind : null,
    booking_id: entry.bookingId && UUID.test(entry.bookingId) ? entry.bookingId : null,
    amount_cents: hasAmount ? Math.round(amount) : null,
    currency: hasAmount ? (/^[A-Z]{3}$/.test(currency) ? currency : "EUR") : null,
    card_last4: cardLast4Of(entry.cardLast4),
    actor_label: entry.staffId ? null : actor && !/[0-9]{13,19}/.test(actor) ? actor : null,
  };
}

/* ---------- Résumé d’un agent ---------- */

export type AgentSummary = {
  actionsToday: number;
  sensitiveToday: number;
  lastAt: string | null;
};

/** Actions du jour, cartes et paiements du jour, dernière activité, pour un collègue. */
export function agentSummary(
  rows: readonly JournalFeedRow[],
  input: { staffId: string; now?: Date; timeZone?: string }
): AgentSummary {
  const now = input.now || new Date();
  const todayKey = journalDayKey(now.toISOString(), input.timeZone);
  let actionsToday = 0;
  let sensitiveToday = 0;
  let lastAt: string | null = null;
  for (const row of rows) {
    if (row.staff_id !== input.staffId) continue;
    if (!lastAt || row.occurred_at > lastAt) lastAt = row.occurred_at;
    if (journalDayKey(row.occurred_at, input.timeZone) !== todayKey) continue;
    actionsToday += 1;
    if (journalIsSensitive(row)) sensitiveToday += 1;
  }
  return { actionsToday, sensitiveToday, lastAt };
}
