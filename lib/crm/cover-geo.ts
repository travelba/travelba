import { coverMatchInText } from "@/lib/crm/covers";
import { PHOTOGRAPHED_CITIES, type PhotographedCity } from "@/lib/crm/cover-coords";

export type GeocodeHit = {
  label: string;
  lat: number;
  lon: number;
  countryCode: string;
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
 * Un point géocodé a toujours une photo :
 * ville citée, ville proche du même pays, pays, puis la ville photographiée la plus proche.
 */
export function photoFromGeocodeHit(hit: GeocodeHit): string {
  const mentioned = coverMatchInText(hit.label);
  if (mentioned && mentioned.rank >= 3) return mentioned.photo;
  const sameCountry = nearestPhotographedCity(hit.lat, hit.lon, hit.countryCode);
  if (sameCountry && sameCountry.km <= 180) return sameCountry.city.photo;
  if (mentioned) return mentioned.photo;
  if (sameCountry && sameCountry.km <= 500) return sameCountry.city.photo;
  const abroad = nearestPhotographedCity(hit.lat, hit.lon);
  if (abroad && abroad.km <= 500) return abroad.city.photo;
  return (sameCountry || abroad)!.city.photo;
}

type NominatimRow = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    country_code?: string;
    state?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
  };
};

/** Lieu quelconque → photo du catalogue. Null seulement si ce n’est pas un lieu. */
export async function photoForUnknownPlace(query: string): Promise<string | null> {
  const key = foldPlace(query);
  if (key.length < 2) return null;
  if (memory.has(key)) return memory.get(key) ?? null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query.trim().slice(0, 160));
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  let photo: string | null = null;
  let remember = false;
  try {
    await waitNominatimSlot();
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Travelba/1.0 (contact@travelba.fr)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (res.ok) {
      remember = true;
      const rows = (await res.json()) as NominatimRow[];
      const hit = rows[0];
      const lat = Number(hit?.lat);
      const lon = Number(hit?.lon);
      const address = hit?.address || {};
      const label = [hit?.display_name, address.state, address.county, address.city, address.town, address.village]
        .filter(Boolean)
        .join(" ");
      if (hit && Number.isFinite(lat) && Number.isFinite(lon) && geocodeAgrees(query, label)) {
        photo = photoFromGeocodeHit({
          label,
          lat,
          lon,
          countryCode: (address.country_code || "").toLowerCase(),
        });
      }
    }
  } catch {
    return null;
  }
  if (remember) memory.set(key, photo);
  return photo;
}
