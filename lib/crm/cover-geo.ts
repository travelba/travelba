import { coverMatchInText, generatedCoverIdForPlace } from "@/lib/crm/covers";
import { PHOTOGRAPHED_CITIES, type PhotographedCity } from "@/lib/crm/cover-coords";

export type GeocodeHit = {
  label: string;
  lat: number;
  lon: number;
  countryCode: string;
  country?: string;
  state?: string;
  type?: string;
};

const memory = new Map<string, string | null>();
let nominatimNotBefore = 0;

function foldPlace(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le résultat Nominatim parle bien du texte demandé. « 40 ans » ne devient pas un lieu. */
export function geocodeAgrees(query: string, label: string) {
  const asked = foldPlace(query);
  const found = ` ${foldPlace(label)} `;
  if (asked.length < 2) return false;
  const words = asked.split(" ").filter((word) => word.length >= 4);
  if (words.length) return words.some((word) => found.includes(` ${word} `));
  return found.includes(` ${asked} `);
}

async function waitNominatimSlot() {
  const now = Date.now();
  const start = Math.max(now, nominatimNotBefore);
  nominatimNotBefore = start + 1100;
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
}

function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Ville photographiée la plus proche. `country` limite au même pays. */
export function nearestPhotographedCity(
  lat: number,
  lon: number,
  country?: string | null
): { city: PhotographedCity; km: number } | null {
  const want = (country || "").trim().toLowerCase();
  let best: { city: PhotographedCity; km: number } | null = null;
  for (const city of PHOTOGRAPHED_CITIES) {
    if (want && city.country !== want) continue;
    const km = kmBetween(lat, lon, city.lat, city.lon);
    if (!best || km < best.km) best = { city, km };
  }
  return best;
}

/**
 * Lieu géocodé : la ville citée, sinon une image à générer pour ce nom.
 * Ni la ville photographiée la plus proche, ni la carte postale du pays.
 */
export function photoFromGeocodeHit(hit: GeocodeHit): string | null {
  const mentioned = coverMatchInText(hit.label);
  if (mentioned && mentioned.rank >= 3) return mentioned.photo;
  const locality = (hit.label.split(",")[0] || "").trim();
  const generated = generatedCoverIdForPlace(locality);
  if (generated) return generated;
  return mentioned?.photo ?? null;
}

/**
 * Ancien repli : ville photographiée proche, sinon le pays.
 * Sert à retrouver les dossiers qui affichent encore cette image. L'écran ne l'utilise plus.
 */
export function legacyNearestCover(hit: GeocodeHit): string | null {
  const mentioned = coverMatchInText(hit.label);
  if (mentioned && mentioned.rank >= 3) return null;
  const sameCountry = nearestPhotographedCity(hit.lat, hit.lon, hit.countryCode);
  if (sameCountry && sameCountry.km <= 180) return sameCountry.city.photo;
  if (mentioned) return mentioned.photo;
  if (sameCountry && sameCountry.km <= 500) return sameCountry.city.photo;
  const abroad = nearestPhotographedCity(hit.lat, hit.lon);
  if (abroad && abroad.km <= 500) return abroad.city.photo;
  return (sameCountry || abroad)?.city.photo ?? null;
}

type NominatimRow = {
  lat?: string;
  lon?: string;
  display_name?: string;
  type?: string;
  class?: string;
  address?: {
    country_code?: string;
    country?: string;
    state?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
  };
};

const geoMemory = new Map<string, GeocodeHit | null>();

export type PlaceDescription = { country: string; state: string; type: string };

/** Point Nominatim. Null si ce n'est pas un lieu. Une erreur réseau n'est pas mémorisée. */
export async function geocodePlace(query: string): Promise<{ hit: GeocodeHit | null; remember: boolean }> {
  const key = foldPlace(query);
  if (key.length < 2) return { hit: null, remember: false };
  if (geoMemory.has(key)) return { hit: geoMemory.get(key) ?? null, remember: true };

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query.trim().slice(0, 160));
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  try {
    await waitNominatimSlot();
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Travelba/1.0 (contact@travelba.fr)",
        Accept: "application/json",
        "Accept-Language": "fr",
      },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!res.ok) return { hit: null, remember: false };
    const rows = (await res.json()) as NominatimRow[];
    const row = rows[0];
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    const address = row?.address || {};
    const label = [row?.display_name, address.state, address.county, address.city, address.town, address.village]
      .filter(Boolean)
      .join(" ");
    const hit =
      row && Number.isFinite(lat) && Number.isFinite(lon) && geocodeAgrees(query, label)
        ? {
            label,
            lat,
            lon,
            countryCode: (address.country_code || "").toLowerCase(),
            country: address.country || "",
            state: [address.state, address.county].filter(Boolean).join(" "),
            type: row.type || row.class || "",
          }
        : null;
    geoMemory.set(key, hit);
    return { hit, remember: true };
  } catch {
    return { hit: null, remember: false };
  }
}

/** Pays et caractère du lieu, pour le prompt. N'influence pas l'image affichée. */
export async function describePlace(query: string): Promise<PlaceDescription | null> {
  const { hit } = await geocodePlace(query);
  if (!hit) return null;
  return { country: hit.country || "", state: hit.state || "", type: hit.type || "" };
}

/** Lieu quelconque → image du lieu, ou la ville déjà photographiée citée dans le libellé. */
export async function photoForUnknownPlace(query: string): Promise<string | null> {
  const key = foldPlace(query);
  if (key.length < 2) return null;
  if (memory.has(key)) return memory.get(key) ?? null;
  const { hit, remember } = await geocodePlace(query);
  const photo = hit ? photoFromGeocodeHit(hit) : null;
  if (remember) memory.set(key, photo);
  return photo;
}
