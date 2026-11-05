/**
 * Carte Hôtels. Le jeton Mapbox est public (`pk.`), jamais un secret `sk.`.
 * Sans jeton valide, l’écran garde les tuiles actuelles.
 */

export const DEFAULT_MAPBOX_STYLE = "mapbox://styles/mapbox/light-v11";

const PUBLIC_TOKEN = /^pk\.[A-Za-z0-9._-]{20,}$/;
const MAPBOX_STYLE =
  /^(?:mapbox:\/\/styles\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+|https:\/\/api\.mapbox\.com\/styles\/v1\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)(?:\?[A-Za-z0-9_.=&%-]+)?$/;

export function publicMapboxToken(value: string | undefined | null): string | null {
  const token = (value || "").trim();
  if (!PUBLIC_TOKEN.test(token)) return null;
  return token;
}

export function publicMapboxStyle(value: string | undefined | null): string {
  const style = (value || "").trim();
  if (!style || !MAPBOX_STYLE.test(style)) return DEFAULT_MAPBOX_STYLE;
  return style;
}

/** 1 à 5. Un score d’avis (8,4) ou un texte n’est pas une étoile. */
export function hotelStars(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\s*[1-5]\s*$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return null;
  return parsed;
}

export function hotelMapCaption(hotel: { city?: string | null; stars?: number | null }) {
  const stars =
    hotel.stars != null && hotel.stars >= 1 && hotel.stars <= 5
      ? `${hotel.stars} ${hotel.stars > 1 ? "étoiles" : "étoile"}`
      : "";
  const area = (hotel.city || "").replace(/\s+/g, " ").trim();
  return [stars, area].filter(Boolean).join(" · ");
}

export function hotelPinClass(selected: boolean) {
  return selected ? "h-pin h-hit h-pin-on hotel-map-pin" : "h-pin h-hit hotel-map-pin";
}

function httpsPhoto(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Façade d’abord, puis la galerie. Jamais une URL non https. */
export function hotelPreviewImages(hotel: { images?: string[] | null; photo?: string | null; thumb?: string | null }) {
  const raw = [hotel.photo || "", ...(hotel.images || []), hotel.thumb || ""];
  const out: string[] = [];
  for (const item of raw) {
    const url = httpsPhoto(item);
    if (!url || out.includes(url)) continue;
    out.push(url);
    if (out.length === 12) break;
  }
  return out;
}

export type HotelMapPoint = { lat: number; lng: number };

/** Sud-ouest et nord-est, longitude puis latitude, comme Mapbox. */
export function hotelMapBounds(points: HotelMapPoint[]): { sw: [number, number]; ne: [number, number] } | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let count = 0;
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) continue;
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    count += 1;
  }
  if (!count) return null;
  return { sw: [minLng, minLat], ne: [maxLng, maxLat] };
}
