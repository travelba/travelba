/**
 * Parsing pur des messages Gmail (API users.messages.get format=full).
 * Aucune dépendance réseau / server-only : testable en isolation.
 */

export type GmailHeader = { name?: string; value?: string };

export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};

export type GmailMessagePayload = {
  headers?: GmailHeader[];
  mimeType?: string;
  filename?: string;
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};

export type RawGmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailMessagePayload;
};

export type GmailAttachmentRef = {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
};

export type ParsedGmailMessage = {
  id: string;
  threadId: string;
  labelIds: string[];
  from: string;
  fromEmail: string;
  subject: string;
  receivedAt: string | null;
  text: string;
  html: string;
  attachments: GmailAttachmentRef[];
  /** En-tête Auto-Submitted présent et différent de « no ». */
  autoSubmitted: boolean;
};

export function decodeBase64Url(data: string | null | undefined): string {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

export function headerValue(
  headers: GmailHeader[] | undefined,
  name: string
): string {
  const lower = name.toLowerCase();
  for (const h of headers || []) {
    if ((h.name || "").toLowerCase() === lower) return (h.value || "").trim();
  }
  return "";
}

/** Extrait l'adresse d'un en-tête From type « Nom <a@b.com> ». */
export function extractEmailAddress(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : value).trim();
  const at = candidate.match(/[^\s<>]+@[^\s<>]+/);
  return (at ? at[0] : candidate).toLowerCase();
}

/** Convertit du HTML e-mail en texte lisible (suffisant pour l'extraction). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function walkParts(
  part: GmailPart | GmailMessagePayload | undefined,
  visit: (p: GmailPart) => void
) {
  if (!part) return;
  const parts = part.parts || [];
  for (const child of parts) {
    visit(child);
    walkParts(child, visit);
  }
}

function collectBodies(payload: GmailMessagePayload | undefined): { plain: string; html: string } {
  if (!payload) return { plain: "", html: "" };
  let plain = "";
  let html = "";
  const consider = (mime: string | undefined, data: string | undefined, filename?: string) => {
    if (filename) return; // pièce jointe, pas le corps
    if (!data) return;
    if (mime === "text/plain" && !plain) plain = decodeBase64Url(data);
    else if (mime === "text/html" && !html) html = decodeBase64Url(data);
  };
  consider(payload.mimeType, payload.body?.data, payload.filename);
  walkParts(payload, (p) => consider(p.mimeType, p.body?.data, p.filename));
  return { plain: plain.trim(), html: html.trim() };
}

/** Corps texte : préfère text/plain, sinon dérive du text/html. */
export function collectBodyText(payload: GmailMessagePayload | undefined): string {
  const { plain, html } = collectBodies(payload);
  if (plain) return plain;
  if (html) return htmlToText(html);
  return "";
}

/** HTML d’origine du message, vide s’il n’y en a pas. */
export function collectBodyHtml(payload: GmailMessagePayload | undefined): string {
  return collectBodies(payload).html;
}

export function collectAttachments(
  payload: GmailMessagePayload | undefined
): GmailAttachmentRef[] {
  const out: GmailAttachmentRef[] = [];
  const seen = new Set<string>();
  const consider = (p: GmailPart) => {
    const attachmentId = p.body?.attachmentId;
    const filename = (p.filename || "").trim();
    if (!attachmentId || !filename) return;
    if (seen.has(attachmentId)) return;
    seen.add(attachmentId);
    out.push({
      filename,
      mimeType: p.mimeType || "application/octet-stream",
      attachmentId,
      size: p.body?.size || 0,
    });
  };
  walkParts(payload, consider);
  return out;
}

export function parseGmailMessage(raw: RawGmailMessage): ParsedGmailMessage {
  const payload = raw.payload;
  const from = headerValue(payload?.headers, "From");
  const subject = headerValue(payload?.headers, "Subject");
  const internal = raw.internalDate ? Number(raw.internalDate) : NaN;
  const receivedAt = Number.isFinite(internal)
    ? new Date(internal).toISOString()
    : null;
  return {
    id: String(raw.id || ""),
    threadId: String(raw.threadId || ""),
    labelIds: Array.isArray(raw.labelIds) ? raw.labelIds : [],
    from,
    fromEmail: extractEmailAddress(from),
    subject,
    receivedAt,
    text: collectBodyText(payload),
    html: collectBodyHtml(payload),
    attachments: collectAttachments(payload),
    autoSubmitted: autoSubmittedHeader(payload?.headers),
  };
}

function autoSubmittedHeader(headers: GmailHeader[] | undefined) {
  const value = headerValue(headers, "Auto-Submitted").toLowerCase();
  return Boolean(value) && value !== "no";
}

/** Types d'historique à synchroniser : arrivée ET application de label. */
export const GMAIL_HISTORY_TYPES = ["messageAdded", "labelAdded"] as const;

export type GmailHistoryMessageRef = {
  id?: string;
  labelIds?: string[];
};

export type GmailHistoryRecord = {
  messagesAdded?: { message?: GmailHistoryMessageRef }[];
  labelsAdded?: { message?: GmailHistoryMessageRef; labelIds?: string[] }[];
};

/**
 * Query users.history.list : `historyTypes` est répété (messageAdded + labelAdded).
 * Un seul `historyTypes=messageAdded` ignore l'application d'un label sur un mail existant.
 */
export function buildGmailHistorySearchParams(
  startHistoryId: string,
  options?: { labelId?: string; pageToken?: string }
): URLSearchParams {
  const params = new URLSearchParams({ startHistoryId });
  for (const type of GMAIL_HISTORY_TYPES) {
    params.append("historyTypes", type);
  }
  if (options?.labelId) params.set("labelId", options.labelId);
  if (options?.pageToken) params.set("pageToken", options.pageToken);
  return params;
}

function matchesWatchedLabel(
  labelIds: string[] | undefined,
  labelId?: string
): boolean {
  if (!labelId) return true;
  if (!labelIds || !labelIds.length) return true;
  return labelIds.includes(labelId);
}

/**
 * IDs à capturer depuis users.history.list.
 * - messagesAdded : mail nouveau (éventuellement déjà labellisé par un filtre).
 * - labelsAdded : label appliqué à un message déjà dans la boîte.
 */
export function collectHistoryMessageIds(
  history: GmailHistoryRecord[] | undefined,
  labelId?: string
): string[] {
  const ids = new Set<string>();
  for (const record of history || []) {
    for (const added of record.messagesAdded || []) {
      const id = added.message?.id;
      if (!id) continue;
      if (!matchesWatchedLabel(added.message?.labelIds, labelId)) continue;
      ids.add(id);
    }
    for (const labeled of record.labelsAdded || []) {
      const id = labeled.message?.id;
      if (!id) continue;
      const addedLabels = labeled.labelIds;
      const messageLabels = labeled.message?.labelIds;
      if (labelId) {
        if (addedLabels?.length) {
          if (!addedLabels.includes(labelId)) continue;
        } else if (!matchesWatchedLabel(messageLabels, labelId)) {
          continue;
        }
      }
      ids.add(id);
    }
  }
  return [...ids];
}

/** Label Gmail des confirmations de billet d'avion (`label:billet-avion`). */
export const BILLET_AVION_LABEL = "billet-avion";

/** Labels suivis si `GMAIL_LABELS` est vide. */
export const DEFAULT_GMAIL_LABELS = [
  "little-emperors",
  "expedia-taap",
  BILLET_AVION_LABEL,
];

/**
 * Clé de comparaison Gmail : casse ignorée, espaces et underscores → tirets.
 * `label:billet-avion` retrouve « Billet avion » comme « billet-avion ».
 */
export function gmailLabelMatchKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function splitGmailLabelList(raw: string | undefined | null): string[] {
  return (raw || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Labels à suivre. L'env est prioritaire (noms affichés Gmail), puis les
 * défauts manquants — dont `billet-avion` — sont ajoutés.
 */
export function mergeGmailLabelNames(raw: string | undefined | null): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const name of [...splitGmailLabelList(raw), ...DEFAULT_GMAIL_LABELS]) {
    const key = gmailLabelMatchKey(name);
    if (!key || used.has(key)) continue;
    used.add(key);
    out.push(name);
  }
  return out;
}

/** Associe chaque nom demandé à l'id Gmail (clé normalisée). */
export function matchGmailLabelIds(
  requested: string[],
  labels: { id?: string; name?: string }[]
): Map<string, string> {
  const wanted = new Map<string, string>();
  for (const name of requested) {
    const key = gmailLabelMatchKey(name);
    if (key && !wanted.has(key)) wanted.set(key, name);
  }
  const out = new Map<string, string>();
  for (const label of labels) {
    const key = gmailLabelMatchKey(String(label.name || ""));
    const original = wanted.get(key);
    if (original && label.id && !out.has(original)) out.set(original, label.id);
  }
  return out;
}

export const BILLET_BACKFILL_DONE = "done";

/**
 * Curseur de rattrapage `billet-avion`.
 * On reste sur la page tant qu'il reste des ids à insérer.
 * Sinon on avance, puis `done` (seule la première page est revérifiée).
 */
export function nextBilletBackfillCursor(input: {
  unseenIds: string[];
  insertLimit: number;
  nextPageToken?: string;
  resumeToken: string;
  headOnly: boolean;
}): { cursor: string; insertIds: string[] } {
  const insertIds = input.unseenIds.slice(0, Math.max(0, input.insertLimit));
  const moreOnPage = input.unseenIds.length > insertIds.length;
  if (moreOnPage) {
    return {
      cursor: input.headOnly ? BILLET_BACKFILL_DONE : input.resumeToken,
      insertIds,
    };
  }
  if (!input.headOnly && input.nextPageToken) {
    return { cursor: input.nextPageToken, insertIds };
  }
  return { cursor: BILLET_BACKFILL_DONE, insertIds };
}

/** Décode le payload push Pub/Sub Gmail → { emailAddress, historyId }. */
export function decodeGmailPushBody(
  body: unknown
): { emailAddress: string; historyId: string } | null {
  const message = (body as { message?: { data?: string } })?.message;
  const data = message?.data;
  if (!data) return null;
  try {
    const json = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as {
      emailAddress?: string;
      historyId?: string | number;
    };
    if (!json.historyId) return null;
    return {
      emailAddress: String(json.emailAddress || ""),
      historyId: String(json.historyId),
    };
  } catch {
    return null;
  }
}
