import { countryName } from "@/lib/crm/countries";
import rulesFile from "@/lib/crm/visa-rules.json";

/** Table datée (conseils aux voyageurs / exigences publiées pour un passeport français). */
export const VISA_RULES_AS_OF = rulesFile.asOf;

export type FrenchEntryStatus = "none" | "authorization" | "visa" | "unknown";

export type FrenchEntryRule = {
  status: FrenchEntryStatus;
  /** Nom de la formalité, ex. ESTA, e-visa. Null s’il n’y en a pas. */
  formality: string | null;
};

const RULES = rulesFile.rules as Record<string, FrenchEntryRule>;

/** Territoires absents du tableau principal, accès sans formalité pour un passeport français. */
const SUPPLEMENT: Record<string, FrenchEntryRule> = {
  ST: { status: "none", formality: null },
  CW: { status: "none", formality: null },
  BQ: { status: "none", formality: null },
};

const EXTRA_NAMES: Record<string, string> = {
  HK: "Hong Kong",
  MO: "Macao",
  TW: "Taïwan",
  PR: "Porto Rico",
  VI: "Îles Vierges américaines",
  GU: "Guam",
  MP: "Îles Mariannes du Nord",
  AS: "Samoa américaines",
  GP: "Guadeloupe",
  MQ: "Martinique",
  GF: "Guyane",
  RE: "La Réunion",
  YT: "Mayotte",
  NC: "Nouvelle-Calédonie",
  PF: "Polynésie française",
  PM: "Saint-Pierre-et-Miquelon",
  BL: "Saint-Barthélemy",
  MF: "Saint-Martin",
  WF: "Wallis-et-Futuna",
  XK: "Kosovo",
  MK: "Macédoine du Nord",
  CW: "Curaçao",
  AW: "Aruba",
  SX: "Saint-Martin",
  BM: "Bermudes",
  KY: "Îles Caïmans",
  GI: "Gibraltar",
};

export function entryForFrenchPassport(iso2: string | null | undefined): FrenchEntryRule {
  const iso = String(iso2 || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return { status: "unknown", formality: null };
  return RULES[iso] || SUPPLEMENT[iso] || { status: "unknown", formality: null };
}

export function destinationCountryName(iso2: string) {
  const iso = iso2.toUpperCase();
  return EXTRA_NAMES[iso] || countryName(iso) || iso;
}

export function frenchEntryNeedsFormality(rule: FrenchEntryRule) {
  return rule.status === "authorization" || rule.status === "visa";
}
