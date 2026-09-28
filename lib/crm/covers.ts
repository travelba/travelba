import type { CrmBooking } from "@/lib/crm/types";
import { coverQuery, stayArrivalPlaces } from "@/lib/crm/carnet";
import {
  cityOwnCoverPhoto,
  countryCodeForPlace,
  countryCoverPhoto,
  lookupCoverPhoto,
} from "@/lib/crm/cover-catalog";

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

export type CoverPlaceItem = { kind?: string | null; details?: Record<string, unknown> | null };

export type CoverPlan =
  | { mode: "single"; src: string; fallback: string | null }
  | { mode: "split"; src: string; srcB: string }
  | { mode: "none" };

function catalogUrl(photoId: string) {
  return catalogCoverUrl(photoId);
}

function arrivalPlaces(
  booking: Pick<CrmBooking, "destination" | "title">,
  options?: { items?: CoverPlaceItem[]; places?: string[] }
) {
  if (options?.places?.length) return options.places;
  const fromItems = options?.items?.length
    ? stayArrivalPlaces(null, null, options.items)
    : [];
  if (fromItems.length) return fromItems;
  return stayArrivalPlaces(booking.destination, booking.title);
}

/** Une ville : sa photo. Deux villes qui ont chacune la leur : diagonale. Sinon le pays. */
export function bookingCoverPlan(
  booking: CoverBooking,
  options?: { items?: CoverPlaceItem[]; places?: string[]; partage?: string | null }
): CoverPlan {
  if (booking.cover_image_path) {
    const params = new URLSearchParams({ path: booking.cover_image_path });
    if (booking.updated_at) params.set("v", booking.updated_at);
    if (options?.partage) params.set("partage", options.partage);
    const fallback = placeCoverUrl(booking);
    return { mode: "single", src: `/api/files?${params.toString()}`, fallback };
  }
  const places = arrivalPlaces(booking, options);
  const countries: string[] = [];
  for (const place of places) {
    const code = countryCodeForPlace(placeKey(place));
    if (code && !countries.includes(code)) countries.push(code);
  }
  if (places.length >= 2 && countries.length === 1) {
    const own: string[] = [];
    for (const place of places) {
      const photo = cityOwnCoverPhoto(placeKey(place));
      if (photo && !own.includes(photo)) own.push(photo);
    }
    if (own.length >= 2) {
      return { mode: "split", src: catalogUrl(own[0]), srcB: catalogUrl(own[1]) };
    }
    const photo = countryCoverPhoto(countries[0]);
    if (photo) return { mode: "single", src: catalogUrl(photo), fallback: null };
  }
  if (countries.length >= 2) {
    const photos = countries
      .map((code) => countryCoverPhoto(code))
      .filter((photo): photo is string => Boolean(photo))
      .slice(0, 2);
    if (photos.length === 2) {
      return { mode: "split", src: catalogUrl(photos[0]), srcB: catalogUrl(photos[1]) };
    }
    if (photos.length === 1) return { mode: "single", src: catalogUrl(photos[0]), fallback: null };
  }
  const single = unsplashKeywordMatch(booking);
  return single ? { mode: "single", src: catalogUrl(single), fallback: null } : { mode: "none" };
}

export function placeCoverUrl(booking: Pick<CrmBooking, "destination" | "title">, _width = 960) {
  const match = unsplashKeywordMatch(booking);
  return match ? catalogCoverUrl(match) : null;
}

/** Import agence, sinon photo du lieu. Lieu inconnu : null (fond marine). */
export function bookingCoverUrl(
  booking: CoverBooking,
  _width = 960,
  access?: { partage?: string | null; items?: CoverPlaceItem[]; places?: string[] }
) {
  const plan = bookingCoverPlan(booking, access);
  if (plan.mode === "none") return null;
  return plan.src;
}
