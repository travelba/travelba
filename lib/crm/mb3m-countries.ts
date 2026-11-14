/** Codes pays de MB3M, lus dans GetCountries (256). Le Kosovo n’y est pas. */

export const MB3M_COUNTRY_CODES = [
  "DE", "AT", "BE", "HR", "CW", "DK", "ES", "ES-CN",
  "US", "FI", "FR", "GR", "GR-9", "GG", "HU", "IM",
  "IE", "IT", "IT-88", "IT-82", "JE", "MT", "ME", "NO",
  "NL", "PL", "PT", "PT-30", "RO", "GB", "BL", "MF",
  "SX", "RS", "SE", "CH", "CZ", "AF", "ZA", "AX",
  "AL", "DZ", "AD", "AO", "AI", "AQ", "AG", "AN",
  "SA", "AR", "AM", "AW", "AU", "AZ", "BS", "BH",
  "ES-IB", "BD", "BB", "BY", "BZ", "BJ", "BM", "BO",
  "BA", "BW", "BT", "BV", "BR", "BN", "BG", "BF",
  "BI", "KY", "KH", "CM", "CA", "CV", "CF", "CL",
  "CN", "CX", "CY", "CC", "CO", "KM", "CG", "CD",
  "CK", "KR", "KP", "CR", "CI", "CU", "DJ", "DO",
  "DM", "EG", "SV", "AE", "EC", "ER", "EE", "ET",
  "EU", "FK", "FO", "FJ", "GA", "GM", "GE", "GS",
  "GH", "GI", "GD", "GL", "GP", "GU", "GT", "GN",
  "GQ", "GW", "GY", "GF", "HT", "HM", "HN", "HK",
  "UM", "VG", "VI", "IN", "ID", "IR", "IQ", "IS",
  "IL", "JM", "JP", "JO", "KZ", "KE", "KG", "KI",
  "KW", "LA", "LS", "LV", "LB", "LR", "LY", "LI",
  "LT", "LU", "MO", "MK", "MG", "MY", "MW", "MV",
  "ML", "MP", "MA", "MH", "MQ", "MU", "MR", "YT",
  "MX", "FM", "MD", "MC", "MN", "MS", "MZ", "MM",
  "NA", "NR", "NP", "NI", "NE", "NG", "NU", "NF",
  "NC", "NZ", "IO", "OM", "UG", "UZ", "PK", "PW",
  "PS", "PA", "PG", "PY", "PE", "PH", "PN", "PF",
  "PR", "QA", "RE", "RU", "RW", "EH", "SH", "LC",
  "KN", "SM", "PM", "VA", "VC", "SB", "WS", "AS",
  "ST", "SN", "CS", "SC", "SL", "SG", "SK", "SI",
  "SO", "SD", "LK", "SR", "SJ", "SZ", "SY", "TJ",
  "TW", "TZ", "TD", "TF", "TH", "TL", "TG", "TK",
  "TO", "TT", "TN", "TM", "TC", "TR", "TV", "UA",
  "UY", "VU", "VE", "VN", "WF", "YE", "ZM", "ZW",
] as const;

const MB3M_ACCEPTED = new Set<string>(MB3M_COUNTRY_CODES);

/**
 * Réécrit seulement à l’envoi. La fiche CRM garde le code d’origine.
 * XK (Kosovo) part en RS (Serbie), le seul code voisin présent dans MB3M.
 */
export const MB3M_COUNTRY_MAP: Readonly<Record<string, string>> = {
  XK: "RS",
};

export type Mb3mCountrySend = { code?: string; rejected?: string };

/** Code envoyé à MB3M. `rejected` est le code CRM quand MB3M ne le connaît pas. */
export function mapMb3mCountry(code: string | null | undefined): Mb3mCountrySend {
  const raw = (code || "").trim().toUpperCase();
  if (!raw) return {};
  const mapped = MB3M_COUNTRY_MAP[raw] ?? raw;
  if (!MB3M_ACCEPTED.has(mapped)) return { rejected: raw };
  return { code: mapped };
}

export function mb3mUnknownCountryMessage(country: string, entity: string) {
  const text = `MB3M ne connaît pas le pays ${country}.`;
  const who = entity.trim();
  return who ? `${who} : ${text}` : text;
}
