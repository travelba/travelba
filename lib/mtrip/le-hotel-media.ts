/**
 * Enrichissement hôtels mTrip via Little Emperors :
 * jusqu’à 5 photos (inventory) + description FR agence.
 *
 * Règle geo : ne jamais attacher un hôtel LE hors destination du voyage
 * (anti-exemple : Ranch US sur un séjour Marrakech).
 */
import {
  getHotelDetails,
  predictiveSearch,
  LittleEmperorsError,
} from "@/lib/little-emperors/client";
import type {
  HotelDetails,
  MediaObject,
  PredictiveSearchItem,
} from "@/lib/little-emperors/types";
import { upsertInventory } from "./client";
import type { TripDestinationContext } from "./map-guide-to-trip";
import type { MtripInventory } from "./types";

const MAX_HOTEL_PHOTOS = 5;
/** Distance max (km) entre hôtel LE et centre destination attendu. */
const MAX_GEO_KM = 450;

export function pickHotelImages(
  hotel: HotelDetails,
  max = MAX_HOTEL_PHOTOS,
  prefer: string[] = []
): string[] {
  const all: MediaObject[] = [
    ...(hotel.images || []),
    ...(hotel.short_info?.images || []),
  ];
  const unique: MediaObject[] = [];
  const seen = new Set<string>();
  for (const im of all) {
    const url = im.url?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(im);
  }
  const selected: string[] = [];
  for (const p of prefer) {
    const hit = unique.find(
      (im) =>
        (im.description || "").toLowerCase().includes(p.toLowerCase()) &&
        !selected.includes(im.url || "")
    );
    if (hit?.url) selected.push(hit.url);
  }
  for (const im of unique) {
    if (selected.length >= max) break;
    if (im.url && !selected.includes(im.url)) selected.push(im.url);
  }
  return selected.slice(0, max);
}

function amenityLabel(a: string | { name?: string; title?: string }) {
  if (typeof a === "string") return a;
  return a.name || a.title || "";
}

/** Description HTML FR — ton agence, pas collage brut LE EN. */
export function frenchAgencyHotelHtml(
  hotel: HotelDetails,
  city?: string,
  bookingRef?: string | null
): string {
  const place = city || hotel.location || "votre destination";
  const amenities = (hotel.amenities || [])
    .map(amenityLabel)
    .filter(Boolean)
    .slice(0, 10);
  const benefits = (hotel.benefits || []).filter(Boolean).slice(0, 8);
  const raw = (hotel.description || hotel.short_info?.description || "").trim();
  const looksEnglish =
    raw.length > 40 &&
    /\b(the|and|with|from|located|features|guests)\b/i.test(raw) &&
    !/\b(l'|le|la|les|des|pour|situé|hôtel)\b/i.test(raw.slice(0, 120));

  const parts: string[] = [
    `<p><strong>${escapeHtml(hotel.name)}</strong> — sélectionné par Travel Business Agency pour votre séjour à ${escapeHtml(place)}.</p>`,
  ];

  if (raw && !looksEnglish) {
    parts.push(`<p>${escapeHtml(raw.slice(0, 600))}</p>`);
  } else if (raw && looksEnglish) {
    parts.push(
      `<p>Établissement d’exception au cœur de ${escapeHtml(place)}, choisi pour le confort et l’expérience voyageur.</p>`
    );
  } else {
    parts.push(
      `<p>Hébergement confirmé pour votre itinéraire, avec les standards de confort attendus par notre agence.</p>`
    );
  }

  if (amenities.length) {
    parts.push(
      `<p><strong>Atouts :</strong> ${amenities.map(escapeHtml).join(", ")}.</p>`
    );
  }
  if (benefits.length) {
    parts.push(
      `<p><strong>Avantages Little Emperors :</strong> ${benefits.map(escapeHtml).join(" · ")}.</p>`
    );
  }
  if (bookingRef) {
    parts.push(
      `<p>Réservation confirmée — réf. <strong>${escapeHtml(String(bookingRef))}</strong>.</p>`
    );
  }
  if (hotel.website) {
    parts.push(
      `<p><a href="${escapeAttr(hotel.website)}">Site officiel</a></p>`
    );
  }
  return parts.join("");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export function inventoryIdForHotel(guideId: string, hotelKey: string) {
  const g = guideId.replace(/-/g, "").slice(0, 8);
  const h = hotelKey
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  return `inv-${g}-${h || "hotel"}`;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Pays clairement hors contexte (si destination connue). */
const FOREIGN_MARKERS: Record<string, RegExp> = {
  US: /\b(united states|usa|u\.s\.a?|california|texas|florida|nevada|arizona|new york|colorado|hawaii)\b/i,
  CA: /\b(canada|ontario|quebec|british columbia)\b/i,
  GB: /\b(united kingdom|england|scotland|london(?!\s*,?\s*ma))\b/i,
};

/**
 * Un hôtel LE est cohérent avec la destination du voyage.
 * Faux match (ex. US sur Marrakech) = rejeter.
 */
export function hotelMatchesTripContext(
  hotel: {
    name?: string;
    location?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
  context?: TripDestinationContext | null
): boolean {
  if (!context?.country && !context?.city && !context?.aliases?.length) {
    return true; // pas de contexte → on ne bloque pas
  }

  const blob = [hotel.location, hotel.address, hotel.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Rejet explicite si le blob pointe un autre pays connu vs destination
  if (context.country && context.country !== "US") {
    if (FOREIGN_MARKERS.US.test(blob)) return false;
  }
  if (context.country && context.country !== "CA") {
    if (FOREIGN_MARKERS.CA.test(blob) && !/\bmaroc|morocco|marrakech\b/i.test(blob))
      return false;
  }

  const aliases = (context.aliases || []).map((a) => a.toLowerCase());
  if (context.city) aliases.push(context.city.toLowerCase());
  if (context.country) {
    aliases.push(context.country.toLowerCase());
  }

  const textHit =
    aliases.length > 0 &&
    aliases.some((a) => a.length >= 2 && blob.includes(a));

  let geoHit = false;
  if (
    context.lat != null &&
    context.lng != null &&
    hotel.latitude != null &&
    hotel.longitude != null
  ) {
    const km = haversineKm(
      context.lat,
      context.lng,
      hotel.latitude,
      hotel.longitude
    );
    geoHit = km <= MAX_GEO_KM;
    // Geo claire hors zone → rejet même si nom vague
    if (!geoHit && km > MAX_GEO_KM) return false;
  }

  if (geoHit) return true;
  if (textHit) return true;

  // Contexte fort mais aucun signal → rejeter (évite hotels[0] US)
  if (context.country || context.city) return false;
  return true;
}

function scoreNameMatch(query: string, candidate: string): number {
  const q = query.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (!q || !c) return 0;
  if (c === q) return 100;
  if (c.startsWith(q) || q.startsWith(c)) return 80;
  if (c.includes(q) || q.includes(c)) return 60;
  const qTokens = q.split(/\s+/).filter((t) => t.length > 2);
  const hits = qTokens.filter((t) => c.includes(t)).length;
  if (qTokens.length && hits === qTokens.length) return 50;
  if (hits > 0) return 20 + hits * 5;
  return 0;
}

function hitMatchesContextText(
  hit: PredictiveSearchItem,
  context?: TripDestinationContext | null
): boolean {
  if (!context?.country && !context?.city && !context?.aliases?.length) {
    return true;
  }
  const blob = `${hit.text} ${hit.location || ""}`.toLowerCase();
  if (context.country && context.country !== "US" && FOREIGN_MARKERS.US.test(blob)) {
    return false;
  }
  const aliases = [
    ...(context.aliases || []),
    context.city,
    context.country,
  ]
    .filter(Boolean)
    .map((a) => String(a).toLowerCase());
  // Si LE donne une location, elle doit coller ; sinon on laisse passer au fetch détails
  if (!hit.location) return true;
  return aliases.some((a) => a.length >= 2 && blob.includes(a));
}

/**
 * Recherche LE par nom, scorée + filtrée par destination.
 * Aucun match sûr → null (mieux aucune photo qu’un hôtel US sur Marrakech).
 */
export async function findLeHotelByName(
  name: string,
  context?: TripDestinationContext | null
): Promise<HotelDetails | null> {
  const q = name.trim();
  if (q.length < 3) return null;
  try {
    const hits = await predictiveSearch(q, 12, ["hotel"]);
    const hotels = hits
      .filter((h) => h.type === "hotel")
      .map((h) => ({
        hit: h,
        score: scoreNameMatch(q, h.text),
      }))
      .filter((x) => x.score >= 20)
      .filter((x) => hitMatchesContextText(x.hit, context))
      .sort((a, b) => b.score - a.score);

    if (!hotels.length) return null;

    // Essayer les meilleurs candidats jusqu’à un match geo/texte détails
    for (const { hit } of hotels.slice(0, 5)) {
      const details = await getHotelDetails(hit.id);
      if (hotelMatchesTripContext(details, context)) {
        return details;
      }
      console.warn(
        "[mtrip] LE hotel rejected (geo/context):",
        details.name,
        details.location,
        "expected",
        context?.city || context?.country
      );
    }
    return null;
  } catch (err) {
    if (err instanceof LittleEmperorsError && err.status === 500) {
      return null;
    }
    console.warn("[mtrip] LE hotel lookup failed:", q, err);
    return null;
  }
}

/**
 * Valide un hôtel déjà résolu par id (ne pas faire confiance aveugle).
 */
export async function resolveLeHotelById(
  id: number,
  context?: TripDestinationContext | null
): Promise<HotelDetails | null> {
  try {
    const details = await getHotelDetails(id);
    if (!hotelMatchesTripContext(details, context)) {
      console.warn(
        "[mtrip] LE hotel id rejected (geo/context):",
        id,
        details.name,
        details.location
      );
      return null;
    }
    return details;
  } catch {
    return null;
  }
}

export async function upsertHotelInventory(opts: {
  guideId: string;
  hotelName: string;
  leHotel: HotelDetails;
  city?: string;
  bookingRef?: string | null;
}): Promise<{ inventoryId: string; photos: string[]; cover?: string }> {
  const photos = pickHotelImages(opts.leHotel, MAX_HOTEL_PHOTOS);
  const inventoryId = inventoryIdForHotel(
    opts.guideId,
    `${opts.leHotel.id}-${opts.hotelName}`
  );
  const city = opts.city || opts.leHotel.location || undefined;
  const payload: MtripInventory = {
    name: opts.leHotel.name || opts.hotelName,
    inventory_id: inventoryId,
    inventory_type: "accommodation",
    description: frenchAgencyHotelHtml(
      opts.leHotel,
      city,
      opts.bookingRef
    ),
    address: opts.leHotel.address,
    city,
    phone: opts.leHotel.phone,
    email: opts.leHotel.email,
    picture_url: photos.length ? photos : undefined,
    location:
      opts.leHotel.latitude != null && opts.leHotel.longitude != null
        ? `${opts.leHotel.latitude},${opts.leHotel.longitude}`
        : undefined,
  };
  await upsertInventory(payload);
  return { inventoryId, photos, cover: photos[0] };
}
