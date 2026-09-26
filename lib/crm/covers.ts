import type { CrmBooking } from "@/lib/crm/types";
import { coverQuery } from "@/lib/crm/carnet";
import { lookupCoverPhoto } from "@/lib/crm/cover-catalog";

/** Photo retouchée du catalogue, ou rien (fond marine) si le fichier n’existe pas. */
export function catalogCoverUrl(photoId: string) {
  return `/api/covers/${photoId}`;
}

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

export function placeCoverUrl(booking: Pick<CrmBooking, "destination" | "title">, _width = 960) {
  const match = unsplashKeywordMatch(booking);
  return match ? catalogCoverUrl(match) : null;
}

/** Import agence, sinon photo du lieu. Lieu inconnu : null (fond marine). */
export function bookingCoverUrl(
  booking: CoverBooking,
  width = 960,
  access?: { partage?: string | null }
) {
  if (booking.cover_image_path) {
    const params = new URLSearchParams({ path: booking.cover_image_path });
    if (booking.updated_at) params.set("v", booking.updated_at);
    if (access?.partage) params.set("partage", access.partage);
    return `/api/files?${params.toString()}`;
  }
  return placeCoverUrl(booking, width);
}
