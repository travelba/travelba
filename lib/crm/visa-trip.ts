import { countryForIata } from "@/lib/crm/airports";
import { countryCodeForPlace } from "@/lib/crm/cover-catalog";
import { visaFeeAmount, visaPassengerCount } from "@/lib/crm/extras";
import { countryIso, foldCountry } from "@/lib/crm/hotel-arrival";
import { isActiveItem } from "@/lib/crm/types";
import {
  destinationCountryName,
  entryForFrenchPassport,
  frenchEntryNeedsFormality,
  officialVisaApplyUrl,
  VISA_RULES_AS_OF,
  type FrenchEntryStatus,
} from "@/lib/crm/visa-fr";

export type FormalityEntry = {
  iso: string;
  name: string;
  status: FrenchEntryStatus;
  formality: string | null;
  /** Portail d’État. Null s’il n’y a pas d’URL vérifiée. */
  applyUrl: string | null;
};

export type FrenchPassportTrip = {
  hasFlight: boolean;
  needsFormality: boolean;
  entries: FormalityEntry[];
  unknownIatas: string[];
  unknownCountries: FormalityEntry[];
  passengers: number;
  amount: number;
  asOf: string;
};

type FlightRow = {
  kind?: string | null;
  details?: Record<string, unknown> | null;
};

function iataCode(value: string | null) {
  if (!value) return null;
  const match = value.toUpperCase().match(/\b([A-Z]{3})\b/);
  return match ? match[1] : null;
}

function detailText(item: FlightRow, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Pays d’arrivée de chaque vol (escales comprises). La France et l’outre-mer français ne comptent pas. */
export function frenchPassportTrip(
  items: FlightRow[] | null | undefined,
  travelerCount = 0
): FrenchPassportTrip {
  const flights = (items || []).filter((item) => item.kind === "flight");
  const passengers = visaPassengerCount(travelerCount);
  const empty: FrenchPassportTrip = {
    hasFlight: flights.length > 0,
    needsFormality: false,
    entries: [],
    unknownIatas: [],
    unknownCountries: [],
    passengers,
    amount: 0,
    asOf: VISA_RULES_AS_OF,
  };
  if (!flights.length) return empty;

  const seen = new Set<string>();
  const entries: FormalityEntry[] = [];
  const unknownIatas: string[] = [];
  const unknownCountries: FormalityEntry[] = [];

  for (const item of flights) {
    const code = iataCode(detailText(item, "to"));
    if (!code) continue;
    const iso = countryForIata(code);
    if (!iso) {
      if (!unknownIatas.includes(code)) unknownIatas.push(code);
      continue;
    }
    if (seen.has(iso)) continue;
    seen.add(iso);
    const rule = entryForFrenchPassport(iso);
    if (rule.status === "none") continue;
    const row: FormalityEntry = {
      iso,
      name: destinationCountryName(iso),
      status: rule.status,
      formality: rule.formality,
      applyUrl: officialVisaApplyUrl(iso),
    };
    if (rule.status === "unknown" || !frenchEntryNeedsFormality(rule)) {
      unknownCountries.push(row);
      continue;
    }
    entries.push(row);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  unknownCountries.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const needsFormality = entries.length > 0;
  return {
    hasFlight: true,
    needsFormality,
    entries,
    unknownIatas,
    unknownCountries,
    passengers,
    amount: needsFormality ? visaFeeAmount(travelerCount) : 0,
    asOf: VISA_RULES_AS_OF,
  };
}

/**
 * Carte d’identité française suffisante : France, outre-mer, Schengen,
 * Irlande, Chypre, et les États où cette carte passe (Andorre, Monaco, Saint-Marin, Vatican).
 * Le Royaume-Uni n’y est pas.
 */
const FRENCH_ID_CARD_ZONE = new Set([
  "FR",
  "GP",
  "MQ",
  "GF",
  "RE",
  "YT",
  "PM",
  "BL",
  "MF",
  "NC",
  "PF",
  "WF",
  "AT",
  "BE",
  "BG",
  "HR",
  "CZ",
  "DK",
  "EE",
  "FI",
  "DE",
  "GR",
  "HU",
  "IS",
  "IT",
  "LV",
  "LI",
  "LT",
  "LU",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
  "IE",
  "CY",
  "AD",
  "MC",
  "SM",
  "VA",
]);

const ROUTE_KEYS = [
  "from",
  "to",
  "via",
  "stop",
  "stops",
  "city_from",
  "city_to",
  "route",
  "connection",
  "connections",
  "connection_airport",
  "escale",
  "escales",
  "origin",
  "destination",
  "departure",
  "arrival",
  "segments",
] as const;

export type PassportStayItem = {
  kind?: string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

export function frenchIdCardCovers(iso: string | null | undefined) {
  const code = String(iso || "").trim().toUpperCase();
  return FRENCH_ID_CARD_ZONE.has(code);
}

function placeIso(value: string) {
  const key = foldCountry(value);
  if (!key || key.length < 2) return null;
  const iso = (countryCodeForPlace(key) || countryIso(value) || "").toUpperCase();
  return /^[A-Z]{2}$/.test(iso) ? iso : null;
}

function addPlace(value: string | null | undefined, countries: Set<string>) {
  const raw = (value || "").replace(/\([^)]*\)/g, " ").trim();
  if (!raw) return;
  const bits = raw
    .split(/[,·|/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of bits.length > 1 ? bits : [raw]) {
    const iso = placeIso(part);
    if (iso) countries.add(iso);
  }
}

/** Vrai si le champ est un code aéroport qu’on ne sait pas placer. */
function readRoute(value: string, countries: Set<string>) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const exact = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(exact)) {
    const iso = countryForIata(exact);
    if (iso) countries.add(iso);
    return !iso;
  }
  let unknown = false;
  const withoutCodes = trimmed.replace(/\(([A-Za-z]{3})\)/g, (_match, code: string) => {
    const iso = countryForIata(code);
    if (iso) countries.add(iso);
    else unknown = true;
    return " ";
  });
  if (/^[A-Z]{3}(?:\s*[-–→>/]\s*[A-Z]{3})+$/i.test(exact)) {
    for (const code of exact.match(/[A-Z]{3}/g) || []) {
      const iso = countryForIata(code);
      if (iso) countries.add(iso);
      else unknown = true;
    }
    return unknown;
  }
  addPlace(withoutCodes, countries);
  return unknown;
}

function absorbRoute(value: unknown, countries: Set<string>, depth: number): boolean {
  if (depth > 5 || value == null) return false;
  if (typeof value === "string") return readRoute(value, countries);
  if (Array.isArray(value)) {
    return value.reduce<boolean>((unknown, item) => absorbRoute(item, countries, depth + 1) || unknown, false);
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    let unknown = false;
    for (const key of ROUTE_KEYS) {
      if (key in row) unknown = absorbRoute(row[key], countries, depth + 1) || unknown;
    }
    return unknown;
  }
  return false;
}

/**
 * Passeport demandé pour un voyageur français.
 * Faux quand chaque lieu connu reste en France, dans l’outre-mer ou dans l’espace
 * où la carte d’identité suffit, et qu’aucun vol ne sort de cette zone.
 * Un code aéroport inconnu, ou un séjour qu’on ne sait pas situer, garde le rappel.
 */
export function frenchPassportRequired(
  items: PassportStayItem[] | null | undefined,
  place?: { destination?: string | null; title?: string | null } | null
) {
  const countries = new Set<string>();
  let unknownAirport = false;
  for (const item of items || []) {
    if (!isActiveItem(item)) continue;
    if (item.kind === "flight" || item.kind === "rail") {
      unknownAirport = absorbRoute(item.details, countries, 0) || unknownAirport;
      continue;
    }
    const details = item.details;
    addPlace(typeof details?.country === "string" ? details.country : null, countries);
    addPlace(typeof details?.city === "string" ? details.city : null, countries);
  }
  addPlace(place?.destination, countries);
  addPlace(place?.title, countries);
  if (unknownAirport) return true;
  if (!countries.size) return true;
  for (const iso of countries) {
    if (!frenchIdCardCovers(iso)) return true;
  }
  return false;
}
