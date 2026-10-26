/** Réponse à un message reçu. Le texte se prépare ici ; l’envoi attend la confirmation. */

import { HOTEL_DESK_FROM, cleanRecipients } from "./hotel-desk";

const CARD_RUN = /(?:\d[ -]?){13,19}/;
const MESSAGE_ID = /<[^<>\s]+>/g;

export type ReplyAddresses = {
  to: string[];
  cc: string[];
};

export type ThreadingHeaders = {
  "In-Reply-To": string;
  References: string;
};

function parisDay(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
}

function agencyAddress(email: string) {
  if (email === HOTEL_DESK_FROM) return true;
  const domain = email.split("@")[1] || "";
  return domain === "travelba.fr" || domain.endsWith(".travelba.fr");
}

/** À l’expéditeur. Les autres destinataires d’origine passent en copie. */
export function replyAddresses(input: { from: string; originals: string[] }): ReplyAddresses {
  const from = cleanRecipients([input.from]).filter((email) => !agencyAddress(email));
  const originals = cleanRecipients(input.originals).filter((email) => !agencyAddress(email));
  const sender = from[0] || "";
  if (!sender) return { to: originals, cc: [] };
  return { to: [sender], cc: originals.filter((email) => email !== sender) };
}

/** Citation courte, sans numéro de carte. */
export function replyQuote(body: string) {
  const lines: string[] = [];
  let size = 0;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || CARD_RUN.test(trimmed)) continue;
    if (lines.length >= 8 || size + trimmed.length > 500) {
      lines.push("> …");
      break;
    }
    lines.push(`> ${trimmed}`);
    size += trimmed.length;
  }
  return lines.join("\n");
}

/**
 * Brouillon français. La citation précède la signature, pour que l’identité
 * du séjour se glisse avant « Bien à vous » sans couper la citation.
 */
export function replyDraftBody(input: { body: string; at?: string | null; speaker?: string | null }) {
  const quote = replyQuote(input.body);
  const when = parisDay(input.at);
  const speaker = (input.speaker || "").trim() || "L’hôtel";
  const wrote = when ? `Le ${when}, ${speaker} a écrit :` : `${speaker} a écrit :`;
  const lines = ["Bonjour,", "", "Nous faisons suite à votre message.", ""];
  if (quote) lines.push(wrote, quote, "");
  lines.push("Bien à vous,", "", "Travel Business Agency");
  return lines.join("\n");
}

function angleId(value: string) {
  const trimmed = value.trim();
  const found = trimmed.match(/<[^<>\s]+>/);
  if (found) return found[0];
  if (trimmed.includes("@") && !/\s/.test(trimmed)) return `<${trimmed.replace(/^<|>$/g, "")}>`;
  return "";
}

/** In-Reply-To vise ce message. References reprend la chaîne, puis cet identifiant. */
export function threadingHeaders(input: { messageId: string; references?: string; inReplyTo?: string }): ThreadingHeaders | null {
  const id = angleId(input.messageId);
  if (!id) return null;
  const prior = `${input.references || ""} ${input.inReplyTo || ""}`.match(MESSAGE_ID) || [];
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const item of [...prior, id]) {
    if (seen.has(item)) continue;
    seen.add(item);
    chain.push(item);
  }
  return { "In-Reply-To": id, References: chain.join(" ") };
}

/** Lien vers le bureau de l’hôtel, le brouillon de réponse déjà ouvert. */
export function replyHref(bookingId: string, itemId: string, threadId: string) {
  const params = new URLSearchParams({ hotel: itemId, repondre: threadId });
  return `/admin/reservations/${bookingId}?${params.toString()}`;
}
