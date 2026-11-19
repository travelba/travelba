import { hotelCityLine, hotelDisplayName } from "./carnet";
import { CITY_ALIASES } from "./city-names";
import { countryCodeForPlace, isCatalogCity, isCountryName } from "./cover-catalog";
import type { CrmBookingItem } from "./types";

const NAME_STOP = new Set([
  "the",
  "hotel",
  "hotels",
  "and",
  "at",
  "le",
  "la",
  "les",
  "de",
  "du",
  "des",
  "by",
  "a",
  "an",
  "of",
  "resort",
  "resorts",
]);

export type HotelDirectoryEntry = {
  hotel_id: number;
  hotel_name: string;
  city: string;
  country: string;
};

export function foldHotelLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cityKey(city: string) {
  const folded = foldHotelLabel(city);
  return CITY_ALIASES[folded] || folded;
}

/** « Milano » et « Milan » sont la même ville, y compris dans le nom de l’hôtel. */
function cityDropTokens(cities: string[]) {
  const keys = new Set(cities.map((city) => cityKey(city)).filter(Boolean));
  const drop = new Set<string>();
  for (const key of keys) {
    for (const token of key.split(" ")) if (token) drop.add(token);
  }
  for (const [alias, target] of Object.entries(CITY_ALIASES)) {
    if (!keys.has(target) && !keys.has(alias)) continue;
    for (const token of `${alias} ${target}`.split(" ")) if (token) drop.add(token);
  }
  return drop;
}

function contentTokens(name: string, cities: string[]) {
  const drop = cityDropTokens(cities);
  return foldHotelLabel(name)
    .split(" ")
    .filter((token) => token && !NAME_STOP.has(token) && !drop.has(token) && !/^\d+$/.test(token));
}

function sameTokens(left: string[], right: string[]) {
  if (!left.length || left.length !== right.length) return false;
  const seen = new Set(right);
  return left.every((token) => seen.has(token));
}

/** Les mots du nom le plus court sont tous dans le nom le plus long. */
function tokensCover(left: string[], right: string[]) {
  if (!left.length || !right.length) return false;
  const [small, large] = left.length <= right.length ? [left, right] : [right, left];
  const seen = new Set(large);
  return small.every((token) => seen.has(token));
}

function countryCodes(value: string) {
  const folded = foldHotelLabel(value);
  const codes = new Set<string>();
  if (!folded) return codes;
  codes.add(folded);
  const resolved = countryCodeForPlace(folded);
  if (resolved) codes.add(resolved);
  return codes;
}

function sameCountry(left: string, right: string) {
  const a = countryCodes(left);
  const b = countryCodes(right);
  if (!a.size || !b.size) return false;
  for (const code of a) if (b.has(code)) return true;
  return false;
}

function phraseInName(city: string, name: string) {
  const key = cityKey(city);
  if (!key || key.length < 3) return false;
  return ` ${foldHotelLabel(name)} `.includes(` ${key} `);
}

export type HotelLabel = {
  name: string;
  city: string;
  country?: string;
};

/**
 * Ville compatible : la même, citée dans l’autre nom, ou le même pays si le nom est exact.
 * Un nom qui cite les deux villes (Paris Las Vegas) ne fait pas le pont.
 */
function citiesBridge(card: HotelLabel, row: HotelLabel) {
  if (hotelCitiesCompatible(card.city, row.city)) return true;
  const cardInRow = phraseInName(card.city, row.name);
  const rowInCard = phraseInName(row.city, card.name);
  if (!cardInRow && !rowInCard) return false;
  if (phraseInName(card.city, card.name) && phraseInName(row.city, card.name)) return false;
  if (phraseInName(card.city, row.name) && phraseInName(row.city, row.name)) return false;
  return true;
}

function labelsMatch(card: HotelLabel, row: HotelLabel) {
  const cities = [card.city, row.city];
  const cardTokens = contentTokens(card.name, cities);
  const rowTokens = contentTokens(row.name, cities);
  if (!cardTokens.length || !rowTokens.length) return false;
  if (!tokensCover(cardTokens, rowTokens)) return false;
  if (citiesBridge(card, row)) return true;
  return (
    foldHotelLabel(card.name) === foldHotelLabel(row.name) &&
    sameTokens(cardTokens, rowTokens) &&
    sameCountry(card.country || "", row.country || "")
  );
}

/** Une seule fiche. Deux possibles : aucune. */
export function matchHotelLabel<T extends HotelLabel>(card: HotelLabel, rows: T[]): T | null {
  const name = foldHotelLabel(card.name);
  if (!name || name === "hotel") return null;
  const hits = rows.filter((row) => labelsMatch(card, row));
  return hits.length === 1 ? hits[0] : null;
}

/** Jeton le plus distinctif pour une recherche dans le catalogue. */
export function hotelMatchToken(name: string, city: string) {
  const tokens = contentTokens(name, [city]);
  const long = tokens.filter((token) => token.length >= 3);
  const pool = long.length ? long : tokens;
  pool.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return pool[0] || "";
}

/** Le nom n’est qu’une ville ou un pays, pas un établissement. */
export function hotelNameIsOnlyPlace(name: string, city: string) {
  const folded = foldHotelLabel(name);
  if (!folded || folded === "hotel") return true;
  if (isCountryName(folded) || isCatalogCity(folded)) return true;
  return contentTokens(name, [city]).length === 0;
}

/** Airbnb ou location de villa : pas une fiche d’hôtel à rattraper. */
export function supplierIsPrivateRental(supplier: string | null | undefined) {
  const folded = foldHotelLabel(supplier || "");
  if (!folded) return false;
  if (folded.includes("airbnb")) return true;
  if (/\bvillas?\b/.test(folded) && /\blocation\b|\brental\b|\brent\b/.test(folded)) return true;
  return /^villas?$/.test(folded);
}

/** « Miami Beach » couvre « Miami ». Deux villes vides ne se correspondent pas. */
export function hotelCitiesCompatible(left: string, right: string) {
  const a = cityKey(left);
  const b = cityKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = a.split(" ");
  const tb = b.split(" ");
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return small.every((token) => large.includes(token));
}

export function knownLeHotelId(item: Pick<CrmBookingItem, "details">) {
  for (const key of ["le_hotel_id", "little_emperors_hotel_id", "hotel_id"] as const) {
    const value = item.details?.[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

/**
 * Relie une carte hôtel à une seule fiche du catalogue.
 * Les mots du nom court sont dans le nom long, sans les mots vides ni la ville.
 * La ville est la même, citée dans l’autre nom, ou le pays est le même si le nom est exact.
 * Deux hôtels possibles : on ne choisit pas.
 */
export function matchHotelDirectory(item: CrmBookingItem, directory: HotelDirectoryEntry[]) {
  if (item.kind !== "hotel" || !directory.length) return null;
  const knownId = knownLeHotelId(item);
  if (knownId != null) {
    const byId = directory.find((row) => row.hotel_id === knownId);
    if (byId) return byId;
  }
  const name = hotelDisplayName(item);
  const city = hotelCityLine(item);
  const country = typeof item.details?.country === "string" ? item.details.country : "";
  return matchHotelLabel(
    { name, city, country },
    directory.map((row) => ({ ...row, name: row.hotel_name }))
  );
}
