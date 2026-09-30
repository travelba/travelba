import { hotelCityLine, hotelDisplayName } from "./carnet";
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
]);

/** Villes écrites en français sur une confirmation, ramenées au libellé du catalogue. */
const CITY_ALIASES: Record<string, string> = {
  londres: "london",
  geneve: "geneva",
  venise: "venice",
  venezia: "venice",
  roma: "rome",
  milano: "milan",
  firenze: "florence",
  munchen: "munich",
  muenchen: "munich",
  wien: "vienna",
  bruxelles: "brussels",
  lisboa: "lisbon",
  lisbonne: "lisbon",
  praha: "prague",
  moscou: "moscow",
  pekin: "beijing",
  nyc: "new york",
};

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

function directoryId(item: Pick<CrmBookingItem, "details">) {
  for (const key of ["le_hotel_id", "little_emperors_hotel_id", "hotel_id"] as const) {
    const value = item.details?.[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

/**
 * Relie une carte hôtel à une seule fiche du catalogue.
 * Nom identique, ou mêmes mots une fois la ville retirée (Londres = London, Milano = Milan).
 * Deux hôtels possibles : on ne choisit pas.
 */
export function matchHotelDirectory(item: CrmBookingItem, directory: HotelDirectoryEntry[]) {
  if (item.kind !== "hotel" || !directory.length) return null;
  const knownId = directoryId(item);
  if (knownId != null) {
    const byId = directory.find((row) => row.hotel_id === knownId);
    if (byId) return byId;
  }
  const name = hotelDisplayName(item);
  const city = hotelCityLine(item);
  const folded = foldHotelLabel(name);
  if (!folded || folded === "hotel") return null;
  const exact = directory.filter((row) => foldHotelLabel(row.hotel_name) === folded);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const inCity = exact.filter((row) => hotelCitiesCompatible(city, row.city));
    return inCity.length === 1 ? inCity[0] : null;
  }
  const tokenHits = directory.filter((row) => {
    if (!hotelCitiesCompatible(city, row.city)) return false;
    const cities = [cityKey(city), cityKey(row.city)].filter(Boolean);
    return sameTokens(contentTokens(name, cities), contentTokens(row.hotel_name, cities));
  });
  return tokenHits.length === 1 ? tokenHits[0] : null;
}
