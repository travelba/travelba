import type { RolzoPlace } from "./rolzo";

type FetchImpl = typeof fetch;

export function addressLooksLikeAirport(address: string) {
  const trimmed = address.trim();
  if (/^[A-Za-z]{3}(?:\s*·|\s*,|\s*$)/.test(trimmed)) return true;
  return /a[eé]roport|airport/i.test(trimmed);
}

/** « CDG · Paris » devient une recherche d’aéroport. Une rue reste une rue. */
export function rolzoSearchQuery(address: string) {
  const trimmed = address.trim().replace(/\s+/g, " ");
  const iata = trimmed.match(/^([A-Za-z]{3})(?:\s*·|\s*,|\s*$)/);
  if (iata) return `${iata[1].toUpperCase()} airport`;
  return trimmed;
}

export function placeFromBan(feature: unknown, fullAddress: string): RolzoPlace | null {
  const row = recordOf(feature);
  const props = recordOf(row?.properties);
  const coords = coordinatesOf(row);
  if (!props || !coords) return null;
  const city = text(props.city) || text(props.name);
  if (!city) return null;
  return {
    city,
    country: "FR",
    lat: coords.lat,
    lng: coords.lng,
    fullAddress: text(props.label) || fullAddress,
    state: text(props.context).split(",").slice(-1)[0]?.trim() || "",
  };
}

export function placeFromPhoton(feature: unknown, fullAddress: string): RolzoPlace | null {
  const row = recordOf(feature);
  const props = recordOf(row?.properties);
  const coords = coordinatesOf(row);
  if (!props || !coords) return null;
  const country = text(props.countrycode).toUpperCase();
  const city = text(props.city) || text(props.name) || text(props.state);
  if (!/^[A-Z]{2}$/.test(country) || !city) return null;
  const street = [text(props.housenumber), text(props.street)].filter(Boolean).join(" ");
  const airport = /aerodrome|airport|terminal/.test(text(props.osm_value)) ? "airport" : "";
  const label = [street, text(props.name), city, airport, text(props.country)].filter(Boolean).join(", ");
  return {
    city,
    country,
    lat: coords.lat,
    lng: coords.lng,
    fullAddress: label || fullAddress,
    state: text(props.state),
  };
}

let nominatimNotBefore = 0;

export async function geocodeRolzoPlace(address: string, fetchImpl: FetchImpl = fetch): Promise<RolzoPlace | null> {
  const trimmed = address.trim();
  if (trimmed.length < 2) return null;
  if (addressLooksLikeAirport(trimmed)) return geocodeAirport(trimmed, fetchImpl);
  return lookupPlace(rolzoSearchQuery(trimmed), trimmed, false, fetchImpl);
}

export function placeFromNominatim(row: unknown, fullAddress: string): RolzoPlace | null {
  const record = recordOf(row);
  if (!record) return null;
  const category = text(record.category);
  const kind = text(record.type);
  if (category !== "aeroway" && kind !== "aerodrome" && kind !== "airport") return null;
  const lat = Number(record.lat);
  const lng = Number(record.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = recordOf(record.address);
  const country = text(address?.country_code).toUpperCase();
  const city =
    text(address?.city) || text(address?.town) || text(address?.village) || text(address?.municipality);
  if (!/^[A-Z]{2}$/.test(country) || !city) return null;
  return {
    city,
    country,
    lat,
    lng,
    fullAddress: text(record.name) || text(record.display_name) || fullAddress,
    state: text(address?.state),
  };
}

async function geocodeAirport(address: string, fetchImpl: FetchImpl) {
  const query = rolzoSearchQuery(address);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  await waitNominatimSlot();
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Travelba/1.0 (contact@travelba.fr)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) return null;
    return rows.map((row) => placeFromNominatim(row, address)).find((place) => place) || null;
  } catch {
    return null;
  }
}

async function waitNominatimSlot() {
  const now = Date.now();
  const start = Math.max(now, nominatimNotBefore);
  nominatimNotBefore = start + 1100;
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
}

function foldPlace(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function placeMatchesQuery(query: string, place: RolzoPlace) {
  const blob = foldPlace(`${place.fullAddress} ${place.city} ${place.state}`);
  const iata = query.match(/^([a-z]{3}) airport\b/i);
  if (iata) return blob.includes(iata[1].toLowerCase()) || /airport|aeroport/.test(blob);
  const words = foldPlace(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);
  if (!words.length) return true;
  return words.some((word) => blob.includes(word));
}

async function lookupPlace(query: string, fullAddress: string, airport: boolean, fetchImpl: FetchImpl) {
  const [ban, photon] = await Promise.all([
    readFeatures(banUrl(query), fetchImpl),
    readFeatures(photonUrl(query), fetchImpl),
  ]);
  const french = ban.map((feature) => placeFromBan(feature, fullAddress));
  const world = photon.map((feature) => placeFromPhoton(feature, fullAddress));
  const ordered = airport ? [...world, ...french] : [...french, ...world];
  return ordered.find((place) => place && placeMatchesQuery(query, place)) || null;
}

function banUrl(query: string) {
  const url = new URL("https://api-adresse.data.gouv.fr/search/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  return url;
}

function photonUrl(query: string) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("lang", "fr");
  url.searchParams.set("limit", "5");
  return url;
}

async function readFeatures(url: URL, fetchImpl: FetchImpl) {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { features?: unknown };
    return Array.isArray(json.features) ? json.features : [];
  } catch {
    return [];
  }
}

function coordinatesOf(row: Record<string, unknown> | null) {
  const geometry = recordOf(row?.geometry);
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords)) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function recordOf(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
