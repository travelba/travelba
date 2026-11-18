import { hotelReplyLink, isAgencyMailbox } from "./hotel-desk";
import { unfoldMail } from "./nested-mail";

/** Texte d’un .eml, y compris l’adresse d’un bouton qui n’est que dans un href. */
export function textOfNestedMail(raw: string | Uint8Array) {
  return unfoldMail(raw, { hrefs: true }).texts.join("\n");
}

/**
 * Relire les mails imbriqués seulement tant que le lien n’est pas déjà connu.
 * Le corps qui contient un lien suffit. Un envoi de l’agence n’a pas de lien à chercher.
 */
export function shouldReadNestedMail(input: {
  from: string;
  body: string;
  storedLink: string | null | undefined;
  hasNested: boolean;
}) {
  if (!input.hasNested) return false;
  if (isAgencyMailbox(input.from)) return false;
  if ((input.storedLink || "").trim()) return false;
  if (hotelReplyLink(input.body)) return false;
  return true;
}

/** Lien trouvé dans ce passage, sinon celui déjà enregistré. Jamais l’inverse. */
export function keepHotelThreadLink(found: string | null, stored: string | null | undefined) {
  return found || (stored || "").trim() || null;
}

export type ReplyWindowTurn = {
  direction: "out" | "in";
  receivedAt: string;
  countsAsReply: boolean;
};

/** Heure du premier envoi du fil. Les messages d’avant ne sont pas une réponse. */
export function firstOutboundAt(values: (string | null | undefined)[]) {
  let best: { at: string; ms: number } | null = null;
  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) continue;
    if (!best || ms < best.ms) best = { at: value, ms };
  }
  return best?.at ?? null;
}

export function replyCountsAfterFirstSend(input: {
  receivedAt: string;
  countsAsReply: boolean;
  firstOutboundAt: string | null;
}) {
  if (!input.countsAsReply) return false;
  if (!input.firstOutboundAt) return true;
  const at = Date.parse(input.receivedAt);
  const first = Date.parse(input.firstOutboundAt);
  if (!Number.isFinite(at) || !Number.isFinite(first)) return true;
  return at >= first;
}

/** Un entrant daté avant le premier sortant du fil ne compte pas comme réponse. */
export function withReplyWindow<T extends ReplyWindowTurn>(rows: T[], earlierOutboundAt?: string | null): T[] {
  const first = firstOutboundAt([
    earlierOutboundAt,
    ...rows.filter((row) => row.direction === "out").map((row) => row.receivedAt),
  ]);
  return rows.map((row) => {
    if (row.direction !== "in") return row;
    return {
      ...row,
      countsAsReply: replyCountsAfterFirstSend({
        receivedAt: row.receivedAt,
        countsAsReply: row.countsAsReply,
        firstOutboundAt: first,
      }),
    };
  });
}
