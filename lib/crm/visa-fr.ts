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

/** Le Canada s’affiche eTA, pas l’abréviation française AVE du tableau. */
const DISPLAY_BY_COUNTRY: Record<string, string> = {
  CA: "eTA Canada",
};

function authorizationToken(value: string) {
  const name = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) return null;
  if (/[{}%]|https?:|travelba\.fr/i.test(name)) return null;
  return name;
}

/**
 * Nom lu dans le message : ESTA, ETA, ETA-IL, eTA Canada, NZeTA, ETIAS, e-Visa et le pays.
 * Sans formalité connue, le libellé français du type : Visa, ou ETA.
 */
export function authorizationDisplayName(input?: { country?: string | null; docType?: string | null }) {
  const iso = String(input?.country || "").trim().toUpperCase();
  const forced = DISPLAY_BY_COUNTRY[iso];
  if (forced) return forced;
  if (/^[A-Z]{2}$/.test(iso)) {
    const formality = String(entryForFrenchPassport(iso).formality || "").replace(/\s+/g, " ").trim();
    if (/^e-?visa$/i.test(formality)) {
      const place = destinationCountryName(iso);
      const label = place && place !== iso ? `e-Visa ${place}` : "e-Visa";
      return authorizationToken(label) || "e-Visa";
    }
    if (/^etias$/i.test(formality)) return "ETIAS";
    const token = authorizationToken(formality);
    if (token) return token;
  }
  if (input?.docType === "eta") return "ETA";
  return "Visa";
}

/**
 * Portail d’État vérifié pour déposer la demande.
 * Pas d’URL si le site officiel n’est pas unique et confirmé.
 */
const APPLY_URLS: Record<string, string> = {
  US: "https://esta.cbp.dhs.gov/",
  PR: "https://esta.cbp.dhs.gov/",
  VI: "https://esta.cbp.dhs.gov/",
  GU: "https://esta.cbp.dhs.gov/",
  MP: "https://esta.cbp.dhs.gov/",
  GB: "https://www.gov.uk/eta",
  CA: "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/visiter-canada/ave/demande.html",
  AU: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/evisitor-651",
  NZ: "https://www.immigration.govt.nz/nzeta",
  KR: "https://www.k-eta.go.kr/portal/apply/index.do",
  IL: "https://israel-entry.piba.gov.il/",
  KE: "https://www.etakenya.go.ke/",
  IN: "https://indianvisaonline.gov.in/evisa/tvoa.html",
};

export function officialVisaApplyUrl(iso2: string | null | undefined) {
  const iso = String(iso2 || "").trim().toUpperCase();
  return APPLY_URLS[iso] || null;
}
