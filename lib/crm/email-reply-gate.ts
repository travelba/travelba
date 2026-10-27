/** File ouverte (`reservations-tba`, `crm`) : seulement une réponse à un envoi du CRM. */

import { hotelMailSubjectKey } from "./hotel-desk";
import { gmailLabelMatchKey } from "./gmail-parse";

export const NOT_A_CRM_REPLY = "Pas une réponse à un e-mail envoyé depuis le CRM";
export const AGENCY_COPY = "Copie envoyée depuis le CRM";
export const AUTOMATIC_MAIL = "Message automatique";

const OPEN_MAILBOX = new Set(["reservations-tba", "crm"]);
const FORWARD_PREFIX = /^(?:fw|fwd|tr|wg|rv)\s*:/i;
const REPLY_PREFIX = /^(?:re|ré|r|aw|antw|sv|vs)\s*:/i;

export type SentMailIndex = {
  rfcIds: Set<string>;
  threadIds: Set<string>;
  subjectKeys: Set<string>;
};

export type InboundGateInput = {
  label?: string | null;
  from?: string | null;
  subject?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  threadId?: string | null;
  autoSubmitted?: boolean;
};

export type InboundGateDecision =
  | { action: "queue" }
  | { action: "ignore"; reason: string }
  | { action: "record-sent"; reason: string };

export function emptySentMailIndex(): SentMailIndex {
  return { rfcIds: new Set(), threadIds: new Set(), subjectKeys: new Set() };
}

export function isOpenMailboxLabel(label: string | null | undefined) {
  return OPEN_MAILBOX.has(gmailLabelMatchKey(label || ""));
}

/** Identifiant RFC comparable : sans chevrons, en minuscules. */
export function normalizeRfcMessageId(value: string | null | undefined) {
  return (value || "")
    .trim()
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
}

export function rfcIdsInHeader(value: string | null | undefined) {
  const raw = value || "";
  const found: string[] = [];
  const bracketed = /<([^<>\s]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = bracketed.exec(raw))) {
    const id = normalizeRfcMessageId(match[1]);
    if (id) found.push(id);
  }
  if (found.length) return found;
  const bare = normalizeRfcMessageId(raw);
  return bare.includes("@") ? [bare] : [];
}

export function emailDomain(from: string | null | undefined) {
  const raw = (from || "").trim().toLowerCase();
  const angled = raw.match(/<([^>]+)>/);
  const email = (angled?.[1] || raw).trim();
  const at = email.lastIndexOf("@");
  if (at < 1) return "";
  return email.slice(at + 1).replace(/[^a-z0-9.-].*$/g, "");
}

export function isAgencySender(from: string | null | undefined) {
  const domain = emailDomain(from);
  return domain === "travelba.fr" || domain.endsWith(".travelba.fr");
}

export function isAutomaticSender(from: string | null | undefined) {
  return /mailer-daemon|postmaster/i.test(from || "");
}

/** `Re:` / `R:` / `AW:` ouvrent une réponse. Un transfert (`Fw:`, `Tr:`) non. */
export function isReplySubject(subject: string | null | undefined) {
  const value = (subject || "").replace(/\s+/g, " ").trim();
  if (!value || FORWARD_PREFIX.test(value)) return false;
  return REPLY_PREFIX.test(value);
}

export function matchesCrmReply(input: InboundGateInput, sent: SentMailIndex) {
  const referenced = [...rfcIdsInHeader(input.inReplyTo), ...rfcIdsInHeader(input.references)];
  if (referenced.some((id) => sent.rfcIds.has(id))) return true;
  const threadId = (input.threadId || "").trim();
  if (threadId && sent.threadIds.has(threadId)) return true;
  if (!isReplySubject(input.subject)) return false;
  const key = hotelMailSubjectKey(input.subject || "");
  return Boolean(key && sent.subjectKeys.has(key));
}

/**
 * Les labels de pièces passent. La boîte ouverte ne passe que si le dernier
 * échange est une réponse à un envoi du CRM. La copie d’agence est notée, pas mise en file.
 */
export function decideInboundMail(input: InboundGateInput, sent: SentMailIndex): InboundGateDecision {
  if (!isOpenMailboxLabel(input.label)) return { action: "queue" };
  if (input.autoSubmitted || isAutomaticSender(input.from)) return { action: "ignore", reason: AUTOMATIC_MAIL };
  if (isAgencySender(input.from)) return { action: "record-sent", reason: AGENCY_COPY };
  if (matchesCrmReply(input, sent)) return { action: "queue" };
  return { action: "ignore", reason: NOT_A_CRM_REPLY };
}
