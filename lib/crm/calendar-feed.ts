import { createHmac, timingSafeEqual } from "node:crypto";
import { CALENDAR_STAY_KEY, googlePhoneMap, type PhoneCalendarLinks } from "@/lib/crm/calendar-ics";
import { isVercelPreview, productionOnlySecret } from "@/lib/crm/preview-secrets";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

/**
 * Secret du flux agenda. Uniquement serveur : le lien webcal est une capacité,
 * l’app Calendrier le relit sans cookie de session.
 */
export function calendarFeedSecret() {
  const dedicated = process.env.CALENDAR_FEED_SECRET?.trim() || "";
  if (dedicated) return dedicated;
  if (isVercelPreview()) return "";
  return process.env.CRON_SECRET?.trim() || productionOnlySecret(process.env.SUPABASE_SERVICE_ROLE_KEY) || "";
}

export function calendarFeedSignature(reference: string, itemKey: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`travelba-cal\n${reference}\n${itemKey}`)
    .digest("base64url")
    .slice(0, 32);
}

export function calendarFeedSignatureValid(reference: string, itemKey: string, sig: string, secret: string) {
  if (!secret || !sig) return false;
  const expected = calendarFeedSignature(reference, itemKey, secret);
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function webcalFeedUrl(origin: string, reference: string, itemKey: string) {
  const secret = calendarFeedSecret();
  if (!secret || !reference || !itemKey) return null;
  const sig = calendarFeedSignature(reference, itemKey, secret);
  const host = origin.replace(/\/$/, "").replace(/^https?:\/\//, "");
  const path = `/api/calendrier/${encodeURIComponent(reference)}/${encodeURIComponent(itemKey)}/${sig}.ics`;
  return `webcal://${host}${path}`;
}

export function phoneCalendarMap(origin: string, booking: CrmBooking, items: CrmBookingItem[]): PhoneCalendarLinks {
  const links = googlePhoneMap(booking, items);
  if (!booking.visible_to_client) return links;
  const stay = webcalFeedUrl(origin, booking.reference, CALENDAR_STAY_KEY);
  if (stay) links.stay.webcal = stay;
  for (const item of items) {
    const row = links.items[item.id];
    if (!row) continue;
    row.webcal = webcalFeedUrl(origin, booking.reference, item.id);
  }
  return links;
}
