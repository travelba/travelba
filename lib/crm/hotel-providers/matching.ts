import { CITY_ALIASES } from "@/lib/crm/city-names";
import { foldHotelLabel } from "@/lib/crm/hotel-catalog";

const NAME_DROP = new Set([
  "hotel",
  "hotels",
  "the",
  "le",
  "la",
  "les",
  "de",
  "du",
  "des",
  "and",
  "resort",
  "resorts",
  "a",
  "an",
  "of",
  "by",
  "at",
]);

export type MatchPlace = {
  name: string;
  city: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type MatchDecision = {
  status: "confirmed" | "proposed" | "none";
  method: "geo_name" | "name_city";
  confidence: number;
  distanceKm: number | null;
};

/** Distance en kilomètres. Coordonnées hors bornes : null. */
export function distanceKm(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number }
): number | null {
  if (![left.lat, left.lng, right.lat, right.lng].every((value) => Number.isFinite(value))) return null;
  if (Math.abs(left.lat) > 90 || Math.abs(right.lat) > 90 || Math.abs(left.lng) > 180 || Math.abs(right.lng) > 180) {
    return null;
  }
  const radius = 6371;
  const dLat = ((right.lat - left.lat) * Math.PI) / 180;
  const dLng = ((right.lng - left.lng) * Math.PI) / 180;
  const lat1 = (left.lat * Math.PI) / 180;
  const lat2 = (right.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function cityFold(city: string) {
  const folded = foldHotelLabel(city);
  return CITY_ALIASES[folded] || folded;
}

export function sameCity(left: string, right: string) {
  const a = cityFold(left);
  const b = cityFold(right);
  return Boolean(a && b && a === b);
}

function tokens(name: string, city: string) {
  const drop = new Set(NAME_DROP);
  for (const token of cityFold(city).split(" ")) if (token) drop.add(token);
  return foldHotelLabel(name)
    .split(" ")
    .filter((token) => token && !drop.has(token));
}

/** Similarité de Jaccard sur les mots du nom, sans la ville ni les mots vides. */
export function hotelNameScore(left: string, right: string, city = "") {
  const a = tokens(left, city);
  const b = tokens(right, city);
  if (!a.length || !b.length) return 0;
  const rightSet = new Set(b);
  let shared = 0;
  for (const token of new Set(a)) if (rightSet.has(token)) shared += 1;
  const union = new Set([...a, ...b]).size;
  return union ? shared / union : 0;
}

function addressAgrees(left?: string | null, right?: string | null) {
  const a = foldHotelLabel(left || "");
  const b = foldHotelLabel(right || "");
  if (a.length < 8 || b.length < 8) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * GPS sous 150 m et nom proche : confirmé.
 * GPS proche mais nom seulement plausible, ou nom très proche sans GPS : à vérifier.
 * Un rejet déjà enregistré n’est pas recalculé ici.
 */
export function decideHotelMatch(left: MatchPlace, right: MatchPlace): MatchDecision {
  const city = left.city || right.city;
  const name = hotelNameScore(left.name, right.name, city);
  const coordsReady =
    left.lat != null && left.lng != null && right.lat != null && right.lng != null
      ? distanceKm({ lat: left.lat, lng: left.lng }, { lat: right.lat, lng: right.lng })
      : null;
  const distance = coordsReady;
  if (distance != null && distance <= 0.15 && name >= 0.72) {
    return { status: "confirmed", method: "geo_name", confidence: roundScore(name), distanceKm: distance };
  }
  if (distance != null && distance <= 0.15 && name >= 0.55) {
    return { status: "proposed", method: "geo_name", confidence: roundScore(name), distanceKm: distance };
  }
  if (distance != null && distance <= 0.4 && name >= 0.8) {
    return { status: "proposed", method: "geo_name", confidence: roundScore(name), distanceKm: distance };
  }
  if ((sameCity(left.city, right.city) && name >= 0.92) || (addressAgrees(left.address, right.address) && name >= 0.85)) {
    return { status: "proposed", method: "name_city", confidence: roundScore(name), distanceKm: distance };
  }
  return { status: "none", method: "name_city", confidence: roundScore(name), distanceKm: distance };
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}
