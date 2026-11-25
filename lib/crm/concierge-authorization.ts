import { formatEstaDate } from "./esta";
import type { AuthorizationKind } from "./authorization-client-message";

export type ConciergeAuthorization = {
  bookingId: string;
  travelerId: string;
  traveler: string;
  kind: AuthorizationKind;
  status: string;
  validUntil: string | null;
  checkedAt: string | null;
};

export type AuthorizationCheckIntent = {
  bookingId: string;
  travelerId: string;
  kind: AuthorizationKind;
};

export type AuthorizationReply = {
  text: string;
  tools: string[];
  bookingId: string;
  check: AuthorizationCheckIntent | null;
};

const STATUS_LABEL: Record<string, string> = {
  a_verifier: "à vérifier",
  approuve: "approuvé",
  inacheve: "inachevé",
  introuvable: "introuvable",
  refuse: "refusé",
  en_attente: "en attente",
  non_concerne: "non concerné",
  erreur: "en erreur",
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

function kindName(kind: AuthorizationKind) {
  return kind === "esta" ? "ESTA" : "ETA";
}

export function authorizationBriefLine(row: ConciergeAuthorization) {
  const name = kindName(row.kind);
  const who = row.traveler.trim() || "voyageur";
  const label = STATUS_LABEL[row.status] || "à vérifier";
  const valid = row.status === "approuve" ? formatEstaDate(row.validUntil) : null;
  const checked = formatEstaDate(row.checkedAt);
  const parts = [`${name} de ${who} : ${label}`];
  if (valid) parts.push(`valable jusqu’au ${valid}`);
  if (checked) parts.push(`contrôlé le ${checked}`);
  return parts.join(", ") + ".";
}

/** Promesse sans acte : le filet ouvre alors une demande agence. */
export function replyClaimsEmptyPromise(text: string) {
  const folded = fold(text);
  if (/\bje verifie\b/.test(folded)) return true;
  if (/demande enregistree|c'est enregistre/.test(folded)) return true;
  if (/\best enregistree\b/.test(folded) && /demande|esta|\beta\b/.test(folded)) return true;
  if (/je vous fais un retour|je vous ferai un retour/.test(folded)) return true;
  if (/ajoutee? (?:a|au) (?:votre |le )?dossier/.test(folded)) return true;
  return false;
}

function askedKind(text: string, rows: ConciergeAuthorization[]): AuthorizationKind | null {
  if (/eta-il|eta il|israel/.test(text)) return null;
  if (/\besta\b/.test(text)) return "esta";
  if (/\beta\b/.test(text) && /royaume|angleterre|londres|london|grande-bretagne|\buk\b/.test(text)) return "uk_eta";
  if (/\beta\b/.test(text)) {
    const kinds = new Set(rows.map((row) => row.kind));
    if (kinds.size === 1) return [...kinds][0];
  }
  return null;
}

function wantsRefresh(text: string) {
  return /mets a jour|mettre a jour|relance|reverif|a nouveau|de nouveau|actualise/.test(text);
}

function spokenStatus(row: ConciergeAuthorization) {
  const name = kindName(row.kind);
  const date = formatEstaDate(row.validUntil);
  if (row.status === "approuve") {
    return date
      ? `Votre ${name} est approuvée, valable jusqu’au ${date}.`
      : `Votre ${name} est approuvée.`;
  }
  if (row.status === "introuvable") {
    return `Aucune demande d’${name} n’est trouvée avec le passeport du dossier. L’agence peut vous aider à en faire une.`;
  }
  if (row.status === "refuse") {
    return `Votre ${name} a été refusée. L’agence vous recontacte pour la suite.`;
  }
  if (row.status === "inacheve" || row.status === "en_attente") {
    return `Votre ${name} n’est pas encore au bout. L’agence suit le dossier.`;
  }
  if (row.status === "non_concerne") {
    return `Ce séjour ne demande pas d’${name}.`;
  }
  return "";
}

function knownResult(row: ConciergeAuthorization) {
  return Boolean(row.checkedAt) && row.status !== "a_verifier" && row.status !== "erreur";
}

/**
 * Le concierge lit d’abord le statut déjà en base.
 * Un contrôle ne part que s’il manque, ou si le client demande une mise à jour :
 * même geste que le bouton, ligne en a_verifier puis webhook existant.
 */
export function planAuthorizationReply(
  message: string,
  rows: ConciergeAuthorization[],
  stayId: string | null
): AuthorizationReply | null {
  const text = fold(message);
  const kind = askedKind(text, rows);
  if (!kind) return null;
  const pool = rows.filter((row) => row.kind === kind && (!stayId || row.bookingId === stayId));
  const named = pool.filter((row) => {
    const who = fold(row.traveler).split(/\s+/)[0];
    return who.length >= 3 && text.includes(who);
  });
  const chosen = named.length === 1 ? named : pool.length === 1 ? pool : named;
  if (chosen.length !== 1) {
    if (pool.length > 1) {
      const stays = new Set(pool.map((row) => row.bookingId));
      return {
        text:
          stays.size > 1
            ? `Pour quel séjour voulez-vous l’${kindName(kind)} ?`
            : `Pour quel voyageur voulez-vous l’${kindName(kind)} ?`,
        tools: [],
        bookingId: stayId || pool[0].bookingId,
        check: null,
      };
    }
    return null;
  }
  const row = chosen[0];
  const name = kindName(kind);
  if (!wantsRefresh(text) && knownResult(row)) {
    const sentence = spokenStatus(row);
    if (!sentence) return null;
    return { text: sentence, tools: ["lire_autorisation"], bookingId: row.bookingId, check: null };
  }
  if (row.status === "non_concerne" && !wantsRefresh(text)) {
    return {
      text: spokenStatus(row),
      tools: ["lire_autorisation"],
      bookingId: row.bookingId,
      check: null,
    };
  }
  return {
    text: `Je lance la vérification de votre ${name}. Je reviens vers vous dès que j’ai le résultat.`,
    tools: ["verifier_esta"],
    bookingId: row.bookingId,
    check: { bookingId: row.bookingId, travelerId: row.travelerId, kind },
  };
}
