import type { CrmBooking } from "@/lib/crm/types";
import { coverQuery } from "@/lib/crm/carnet";
import { lookupCoverPhoto } from "@/lib/crm/cover-catalog";

const UNSPLASH = (id: string, width = 960) => {
  const height = Math.max(160, Math.round((width * 9) / 16));
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&h=${height}&q=70`;
};

export type CoverBooking = Pick<CrmBooking, "destination" | "title" | "cover_image_path"> & {
  updated_at?: string | null;
  cover_credit?: string | null;
};

/** Comparaison sur le lieu entier, accents et tirets ignorés. */
export function placeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’.]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function unsplashKeywordMatch(booking: Pick<CrmBooking, "destination" | "title">) {
  const key = placeKey(coverQuery(booking.destination, booking.title));
  return lookupCoverPhoto(key);
}

export function placeCoverUrl(
  booking: Pick<CrmBooking, "destination" | "title">,
  width = 960
) {
  const match = unsplashKeywordMatch(booking);
  return match ? UNSPLASH(match, width) : null;
}

/** Import agence, sinon photo du lieu. Lieu inconnu : null (fond marine). */
export function bookingCoverUrl(booking: CoverBooking, width = 960) {
  if (booking.cover_image_path) {
    const path = `/api/files?path=${encodeURIComponent(booking.cover_image_path)}`;
    if (!booking.updated_at) return path;
    return `${path}&v=${encodeURIComponent(booking.updated_at)}`;
  }
  return placeCoverUrl(booking, width);
}
