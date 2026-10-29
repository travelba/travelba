import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmationRefsAlign, referenceTokens } from "@/lib/crm/email-match";
import { hotelBookingStem, hotelRefsShareBooking } from "@/lib/crm/item-match";
import { firstLeMadeAt, leInstant } from "@/lib/crm/le-made-at";

export type LeMailStamp = {
  received_at?: string | null;
  subject?: string | null;
  extract?: unknown;
  label?: string | null;
};

const EMPEROR = /emperor/i;

function textList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

/** Références de la réservation : confirmation Little Emperors et confirmations d’hôtel. */
export function leBookingNeedles(row: { confirmation_number?: string | null; raw?: unknown }) {
  const refs = [row.confirmation_number];
  const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw) ? (row.raw as Record<string, unknown>) : null;
  if (raw) {
    if (typeof raw.confirmation_number === "string") refs.push(raw.confirmation_number);
    refs.push(...textList(raw.hotel_confirmations));
    if (Array.isArray(raw.rooms)) {
      for (const room of raw.rooms) {
        if (!room || typeof room !== "object") continue;
        const confirmation = (room as { hotel_confirmation?: unknown }).hotel_confirmation;
        if (typeof confirmation === "string") refs.push(confirmation);
      }
    }
  }
  return [...new Set(refs.map((ref) => (ref || "").trim()).filter((ref) => ref.length >= 4))];
}

function mailHaystacks(mail: LeMailStamp) {
  const out: string[] = [];
  if (mail.subject?.trim()) out.push(mail.subject);
  const extract =
    mail.extract && typeof mail.extract === "object" && !Array.isArray(mail.extract)
      ? (mail.extract as { items?: unknown })
      : null;
  const items = Array.isArray(extract?.items) ? extract.items : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as { confirmation_ref?: unknown; details?: unknown };
    if (typeof row.confirmation_ref === "string") out.push(row.confirmation_ref);
    const details =
      row.details && typeof row.details === "object" && !Array.isArray(row.details)
        ? (row.details as { rooms?: unknown })
        : null;
    const rooms = Array.isArray(details?.rooms) ? details.rooms : [];
    for (const room of rooms) {
      if (!room || typeof room !== "object") continue;
      const confirmation = (room as { confirmation_ref?: unknown }).confirmation_ref;
      if (typeof confirmation === "string") out.push(confirmation);
    }
  }
  return out;
}

function mentions(needle: string, hay: string) {
  if (confirmationRefsAlign(needle, hay)) return true;
  const stem = hotelBookingStem(needle);
  if (!stem || stem.length < 5) return false;
  const stemKey = stem.toLowerCase();
  return referenceTokens(hay).some((token) => token === stemKey || hotelRefsShareBooking(needle, token));
}

function mailMatches(needles: string[], mail: LeMailStamp) {
  const haystacks = mailHaystacks(mail);
  return needles.some((needle) => haystacks.some((hay) => mentions(needle, hay)));
}

/** Plus ancien e-mail de confirmation qui porte la référence. Les mises à jour plus tardives ne reculent pas la date. */
export function earliestLeConfirmationAt(needles: string[], mails: LeMailStamp[]) {
  const wanted = [...new Set(needles.map((value) => value.trim()).filter((value) => value.length >= 4))];
  if (!wanted.length) return null;
  let best: string | null = null;
  for (const mail of mails) {
    if (mail.label && !EMPEROR.test(mail.label)) continue;
    const at = leInstant(mail.received_at);
    if (!at || !mailMatches(wanted, mail)) continue;
    if (!best || at < best) best = at;
  }
  return best;
}

export function leListMadeAt(
  row: {
    confirmation_number?: string | null;
    raw?: unknown;
    booked_at?: string | null;
    created_at?: string | null;
  },
  mails: LeMailStamp[]
) {
  return firstLeMadeAt(
    row.raw,
    earliestLeConfirmationAt(leBookingNeedles(row), mails),
    row.booked_at,
    row.created_at
  );
}

export async function loadLeConfirmationMails(admin: SupabaseClient): Promise<LeMailStamp[]> {
  try {
    const query = admin.from("crm_email_ingest").select("received_at, subject, extract, label");
    const filtered =
      typeof (query as { ilike?: (column: string, pattern: string) => typeof query }).ilike === "function"
        ? query.ilike("label", "%emperor%")
        : query;
    const { data, error } = await filtered;
    if (error || !Array.isArray(data)) return [];
    return (data as LeMailStamp[]).filter((mail) => !mail.label || EMPEROR.test(mail.label));
  } catch {
    // Un client de test sans cette requête, ou une lecture refusée : on retombe sur created_at.
    return [];
  }
}
