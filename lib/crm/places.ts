import { countryName } from "./countries";

export type GeoPlace = {
  name?: string | null;
  country?: string | null;
  country_code?: string | null;
  admin1?: string | null;
  feature_code?: string | null;
};

export type PlaceSuggestion = {
  id: string;
  label: string;
  city: string;
  country: string;
};

export function placeLabel(city: string, country: string) {
  const place = city.trim();
  const nation = country.trim();
  if (!nation || place.localeCompare(nation, "fr", { sensitivity: "accent" }) === 0) return place;
  return `${place}, ${nation}`;
}

/** Dernier lieu en cours de frappe, après un séparateur « · ». */
export function destinationQuery(value: string) {
  const parts = value.split("·");
  return (parts[parts.length - 1] || "").trim();
}

export function applyPlace(value: string, label: string) {
  const parts = value.split("·");
  if (parts.length <= 1) return label;
  const head = parts
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);
  return [...head, label].join(" · ");
}

function isLocality(code: string | null | undefined) {
  if (!code) return true;
  return code.startsWith("PPL") || code === "STLMT";
}

function samePlace(left: string, right: string) {
  return left.localeCompare(right, "fr", { sensitivity: "accent" }) === 0;
}

/** Villes dédupliquées, libellé « Ville, Pays » (région si homonymes). */
export function placesFromGeocode(results: GeoPlace[] | null | undefined): PlaceSuggestion[] {
  const cities = (results || []).filter((row) => row.name?.trim() && isLocality(row.feature_code));
  const regions = new Map<string, Set<string>>();
  for (const row of cities) {
    const key = `${row.name!.trim().toLowerCase()}|${(row.country_code || row.country || "").toUpperCase()}`;
    const known = regions.get(key) || new Set<string>();
    known.add((row.admin1 || "").trim().toLowerCase());
    regions.set(key, known);
  }

  const seen = new Set<string>();
  const places: PlaceSuggestion[] = [];
  for (const row of cities) {
    const city = row.name!.trim();
    const country = countryName(row.country_code) || row.country?.trim() || "";
    const key = `${city.toLowerCase()}|${(row.country_code || country).toUpperCase()}`;
    const region = row.admin1?.trim() || "";
    const ambiguous = (regions.get(key)?.size || 0) > 1 && region && !samePlace(region, city);
    const label = ambiguous ? `${city}, ${region}, ${country}` : placeLabel(city, country);
    const id = ambiguous ? `${key}|${region.toLowerCase()}` : key;
    if (seen.has(id)) continue;
    seen.add(id);
    places.push({ id, label, city, country });
    if (places.length >= 8) break;
  }
  return places;
}
