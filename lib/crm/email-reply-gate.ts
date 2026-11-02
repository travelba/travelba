/** Notification : seulement une réponse à un e-mail parti du CRM. La file garde le mail. */

import { hotelMailSubjectKey } from "./hotel-desk";

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

export function emptySentMailIndex(): SentMailIndex {
  return { rfcIds: new Set(), threadIds: new Set(), subjectKeys: new Set() };
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
 * Notification seulement. La file « e-mails à relire » garde le mail.
 * Vrai si ce message répond à un envoi du CRM, quel que soit le label.
 */
export function shouldNotifyInboundMail(input: InboundGateInput, sent: SentMailIndex) {
  if (input.autoSubmitted || isAutomaticSender(input.from)) return false;
  if (isAgencySender(input.from)) return false;
  return matchesCrmReply(input, sent);
}
