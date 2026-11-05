import { cityCoverPhoto } from "@/lib/crm/cover-catalog";
import { catalogCoverUrl, coverDisplayUrl, placeKey } from "@/lib/crm/covers";
import { foldHotelLabel } from "@/lib/crm/hotel-catalog";
import { safeHotelPhoto } from "@/lib/crm/hotel-search";

/**
 * Photo de repli déjà dans le dépôt, quand le lieu n’a pas d’image de catalogue.
 * Les photos d’hôtel viennent des séjours déjà enregistrés, jamais d’une adresse inventée.
 */
export const HOTEL_SEARCH_HERO_FALLBACK = "/whatsapp/hotel.jpg";

/** Puces sous la carte. Une seule liste, à modifier ici. */
export const HOTEL_SEARCH_CITY_CHIPS = ["Paris", "Milan", "Courchevel", "Bordeaux"] as const;

/**
 * Même formulation que le parcours de réservation quand ces privilèges sont lus
 * (petit-déjeuner pour deux, surclassement, arrivée anticipée / départ tardif).
 * Écran d’accueil seulement : elles ne remplacent pas les avantages d’un hôtel.
 */
export const TRAVEL_BA_SEARCH_ADVANTAGES = [
  "Petit-déjeuner pour deux",
  "Surclassement prioritaire selon disponibilité",
  "Arrivée anticipée / départ tardif selon disponibilité",
] as const;

export type FeaturedHotel = {
  name: string;
  city: string;
  photo: string;
  hotelId: number | null;
};

export function hotelLocalScope(customerId: string) {
  return customerId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
}

export function hotelRecentStorageKey(customerId: string) {
  const id = hotelLocalScope(customerId);
  return id ? `hotel-recent-list:${id}` : "hotel-recent-list";
}

export function hotelDraftStorageKey(customerId: string) {
  const id = hotelLocalScope(customerId);
  return id ? `hotel-search-last:${id}` : "hotel-search-last";
}

/** Photo du lieu choisi, sinon l’image d’hôtel déjà hébergée dans le projet. */
export function hotelSearchHeroSrc(place: string) {
  const raw = place.replace(/\s+/g, " ").trim();
  const candidates = [raw, raw.split(",")[0] || "", raw.split(" ")[0] || ""];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = placeKey(candidate);
    if (!key || key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    const photo = cityCoverPhoto(key);
    if (photo) return coverDisplayUrl(catalogCoverUrl(photo), 960);
  }
  return HOTEL_SEARCH_HERO_FALLBACK;
}

/** Hôtels les plus réservés, avec une photo réelle. Sans photo, la ligne est ignorée. */
export function rankFeaturedHotels(
  rows: { name: string; city: string; photo: string; hotelId?: number | null }[],
  limit = 8
): FeaturedHotel[] {
  const counts = new Map<string, FeaturedHotel & { n: number }>();
  for (const row of rows) {
    const name = row.name.replace(/\s+/g, " ").trim().slice(0, 80);
    const photo = safeHotelPhoto(row.photo);
    if (name.length < 2 || !photo) continue;
    const key = foldHotelLabel(name).replace(/\bmilano\b/g, "milan");
    const city = row.city.replace(/\s+/g, " ").trim().slice(0, 80);
    const hotelId = typeof row.hotelId === "number" && Number.isInteger(row.hotelId) && row.hotelId > 0 ? row.hotelId : null;
    const current = counts.get(key);
    if (!current) {
      counts.set(key, { name, city, photo, hotelId, n: 1 });
      continue;
    }
    current.n += 1;
    if (!current.city && city) current.city = city;
    if (!current.hotelId && hotelId) current.hotelId = hotelId;
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "fr"))
    .slice(0, Math.max(0, limit))
    .map(({ name, city, photo, hotelId }) => ({ name, city, photo, hotelId }));
}
