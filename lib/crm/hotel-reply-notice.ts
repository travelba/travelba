import { hotelReplyForDesk } from "./hotel-desk";

/** Une réponse d’hôtel à montrer dans l’admin. Sans e-mail, sans numéro de carte. */
export type HotelReplyNotice = {
  id: string;
  bookingId: string;
  itemId: string;
  hotel: string;
  excerpt: string;
  receivedAt: string;
  href: string;
  /** Bandeau. Absent : réponse d’hôtel. */
  kicker?: string;
};

export type HotelReplyNoticeRow = {
  id: string;
  bookingId: string;
  itemId: string;
  body: string;
  receivedAt: string;
  countsAsReply: boolean;
  hotelName?: string | null;
  title?: string | null;
  subject?: string | null;
};

const EMAIL = /[^\s<>]+@[^\s<>]+/g;
const SYNC_GAP_MS = 120_000;
const GREETING_ONLY =
  /^(?:bonjour|bonsoir|hello|hi|hey|dear|good morning|good afternoon|good evening|cher|chère|madame|monsieur)(?:\s+[\p{L}'’.-]+){0,4}[,!]?$/iu;
const SIGN_OFF_LINE = /^(?:--|—|–|_{5,}|_{2,})$/;
const SIGN_OFF_WORDS =
  /^(?:bien à vous|bien cordialement|cordialement|cdt|cdlt|best regards|kind regards|warm regards|regards|sincerely|sent from(?: my)?\b.*|envoy[eé] depuis\b.*|get outlook\b.*|travel business agency)[,.]?$/i;
const BARE_THANKS = /^(?:merci|thank you|thanks)[,.!]?$/i;

/**
 * Extrait du dernier message : sans image cid, sans citation, sans formule ni « Hello, » seul.
 * Vide s’il ne reste rien à lire.
 */
export function meaningfulMailExcerpt(body: string, max = 180) {
  const cleaned = hotelReplyForDesk(body);
  const kept: string[] = [];
  for (const raw of cleaned.split(/\r?\n/)) {
    let line = raw.replace(EMAIL, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (SIGN_OFF_LINE.test(line) || SIGN_OFF_WORDS.test(line) || BARE_THANKS.test(line)) break;
    if (GREETING_ONLY.test(line)) continue;
    if (/^\+?\d[\d\s().-]{6,}$/.test(line)) continue;
    line = line.replace(/^(?:bonjour|bonsoir|hello|hi|hey)[,!]?\s+/i, "").trim();
    if (!line || GREETING_ONLY.test(line)) continue;
    kept.push(line);
    if (kept.join(" ").length >= max) break;
  }
  const flat = kept.join(" ").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= max) return flat;
  const room = Math.max(1, max - 1);
  const cut = flat.slice(0, room);
  const space = cut.lastIndexOf(" ");
  const base = space > room * 0.6 ? cut.slice(0, space) : cut;
  return `${base.trimEnd()}…`;
}

/**
 * Séjours dont les courriers partis sont relus.
 * En préparation est `draft` : un courrier y part avant que le dossier soit confirmé.
 */
export const HOTEL_REPLY_STAY_STATUSES = ["draft", "quoted", "confirmed"] as const;

export function stayNeedsHotelReplyWatch(status: string) {
  return (HOTEL_REPLY_STAY_STATUSES as readonly string[]).includes(status);
}

export function hotelReplyHref(bookingId: string, itemId: string) {
  return `/admin/reservations/${bookingId}?hotel=${encodeURIComponent(itemId)}`;
}

export function noticeHotelName(input: { hotelName?: string | null; title?: string | null }) {
  const name = (input.hotelName || "").trim();
  if (name) return name;
  const title = (input.title || "").trim();
  if (title) return title;
  return "Hôtel";
}

/** Première phrase utile, sans adresse, sans image et sans numéro de carte. */
export function replyExcerpt(body: string) {
  return meaningfulMailExcerpt(body, 140) || "L'hôtel a répondu.";
}

/** Réponses reçues après le curseur. Une absence ou un message déjà vu n’en fait pas partie. */
export function hotelReplyNotices(rows: HotelReplyNoticeRow[], sinceIso: string | null | undefined): HotelReplyNotice[] {
  const since = sinceIso ? Date.parse(sinceIso) : Number.NaN;
  if (!Number.isFinite(since)) return [];
  return rows
    .filter((row) => row.countsAsReply && Date.parse(row.receivedAt) > since)
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt) || a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      bookingId: row.bookingId,
      itemId: row.itemId,
      hotel: noticeHotelName({ hotelName: row.hotelName, title: row.title }),
      excerpt: replyExcerpt(row.body),
      receivedAt: row.receivedAt,
      href: hotelReplyHref(row.bookingId, row.itemId),
    }));
}

export type RecentHotelReply = HotelReplyNotice & { reference: string; subject: string };

/** Dernières vraies réponses aux courriers envoyés, les plus récentes en premier. */
export function recentHotelReplies(
  rows: HotelReplyNoticeRow[],
  references: Record<string, string>,
  limit = 8
): RecentHotelReply[] {
  return rows
    .filter((row) => row.countsAsReply && row.receivedAt)
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || b.id.localeCompare(a.id))
    .slice(0, Math.max(0, limit))
    .map((row) => ({
      id: row.id,
      bookingId: row.bookingId,
      itemId: row.itemId,
      hotel: noticeHotelName(row),
      excerpt: replyExcerpt(row.body),
      receivedAt: row.receivedAt,
      href: hotelReplyHref(row.bookingId, row.itemId),
      reference: references[row.bookingId] || "",
      subject: (row.subject || "").replace(/^\s*(re|fw|tr)\s*:\s*/i, "").trim(),
    }));
}

/** Vrai si la dernière synchro légère a plus de deux minutes, ou n’a jamais eu lieu. */
export function shouldSyncHotelReplies(lastSyncMs: number | null, nowMs: number, gapMs = SYNC_GAP_MS) {
  if (lastSyncMs == null || !Number.isFinite(lastSyncMs)) return true;
  return nowMs - lastSyncMs >= gapMs;
}
