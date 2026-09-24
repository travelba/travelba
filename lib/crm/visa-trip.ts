import { countryForIata } from "@/lib/crm/airports";
import { visaFeeAmount, visaPassengerCount } from "@/lib/crm/extras";
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
