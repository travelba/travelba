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
};

const EMAIL = /[^\s<>]+@[^\s<>]+/g;
const SYNC_GAP_MS = 120_000;

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

/** Première ligne utile, sans adresse et sans numéro de carte. */
export function replyExcerpt(body: string) {
  const cleaned = hotelReplyForDesk(body);
  for (const raw of cleaned.split(/\r?\n/)) {
    const line = raw.replace(EMAIL, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    return line.slice(0, 140);
  }
  return "L'hôtel a répondu.";
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

/** Vrai si la dernière synchro légère a plus de deux minutes, ou n’a jamais eu lieu. */
export function shouldSyncHotelReplies(lastSyncMs: number | null, nowMs: number, gapMs = SYNC_GAP_MS) {
  if (lastSyncMs == null || !Number.isFinite(lastSyncMs)) return true;
  return nowMs - lastSyncMs >= gapMs;
}
