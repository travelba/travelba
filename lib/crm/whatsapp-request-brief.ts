import type { ConciergeHistoryTurn } from "./whatsapp-conversation";

const CLIENT_TURNS = 6;
const MAX_BODY = 700;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

/** Accusé ou refus court : le besoin est dans les tours d’avant. */
function isAck(text: string) {
  const folded = fold(text).replace(/[.!?,]+$/g, "").trim();
  if (!folded) return true;
  if (/^(oui|yes|ok|okay|ouais|d'accord|volontiers|bien sur|non|no|nan|nope)$/.test(folded)) return true;
  if (/^(non|no)[, ]+(merci|thanks|thank you|svp|please)$/.test(folded)) return true;
  if (/(c'est une question|c est une question|juste une question|seulement une question|it'?s a question|just a question)/.test(folded)) {
    return !/annul|chang|modif|reserv|virement/.test(folded);
  }
  return false;
}

/** Passeport, naissance et MRZ ne vont pas dans la demande. */
export function scrubClientTurn(text: string) {
  const lines = text.split(/\n/).filter((line) => {
    const compact = line.replace(/\s/g, "");
    return !/^[A-Z0-9<]{28,}$/.test(compact);
  });
  return lines
    .join("\n")
    .replace(/\b(passeport|passport|mrz|date de naissance|n[ée]e? le|nee le)\b[^.\n]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Résumé heuristique pour `crm_whatsapp_requests`.
 * Les N derniers messages utiles du client, le séjour s’il est connu, et ce qui est attendu.
 * Pas d’appel modèle.
 */
export function buildAgencyRequestBrief(input: {
  message: string;
  history: ConciergeHistoryTurn[];
  stay?: string | null;
  expected?: string | null;
}) {
  const turns = [
    ...input.history.filter((row) => row.direction === "inbound").map((row) => scrubClientTurn(row.body)),
    scrubClientTurn(input.message),
  ].filter(Boolean);
  const useful = turns.filter((text) => !isAck(text));
  const picked = (useful.length ? useful : turns).slice(-CLIENT_TURNS);
  const need = picked.join("\n") || scrubClientTurn(input.message);
  const lines = [`Besoin : ${need}`];
  if (input.expected?.trim()) lines.push(`Attendu : ${input.expected.trim()}`);
  const stay = input.stay?.trim();
  if (stay) lines.push(`Séjour : ${stay}`);
  return lines.join("\n").slice(0, MAX_BODY);
}
