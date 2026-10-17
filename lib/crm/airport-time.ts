import { countryForIata } from "@/lib/crm/airports";

const LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

/**
 * Pays à un seul fuseau civil. Les pays à plusieurs fuseaux (US, CA, AU, BR, RU, MX, ID…)
 * ne sont pas ici : un aéroport inconnu ne reçoit pas une heure inventée.
 */
const COUNTRY_TZ: Record<string, string> = {
  FR: "Europe/Paris",
  MC: "Europe/Monaco",
  AD: "Europe/Andorra",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  DE: "Europe/Berlin",
  IT: "Europe/Rome",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  BE: "Europe/Brussels",
  NL: "Europe/Amsterdam",
  LU: "Europe/Luxembourg",
  DK: "Europe/Copenhagen",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  FI: "Europe/Helsinki",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  SK: "Europe/Bratislava",
  HU: "Europe/Budapest",
  RO: "Europe/Bucharest",
  BG: "Europe/Sofia",
  GR: "Europe/Athens",
  HR: "Europe/Zagreb",
  SI: "Europe/Ljubljana",
  RS: "Europe/Belgrade",
  BA: "Europe/Sarajevo",
  ME: "Europe/Podgorica",
  MK: "Europe/Skopje",
  AL: "Europe/Tirane",
  MT: "Europe/Malta",
  CY: "Asia/Nicosia",
  TR: "Europe/Istanbul",
  IS: "Atlantic/Reykjavik",
  EE: "Europe/Tallinn",
  LV: "Europe/Riga",
  LT: "Europe/Vilnius",
  UA: "Europe/Kyiv",
  MD: "Europe/Chisinau",
  BY: "Europe/Minsk",
  MA: "Africa/Casablanca",
  TN: "Africa/Tunis",
  DZ: "Africa/Algiers",
  EG: "Africa/Cairo",
  ZA: "Africa/Johannesburg",
  KE: "Africa/Nairobi",
  TZ: "Africa/Dar_es_Salaam",
  MU: "Indian/Mauritius",
  SC: "Indian/Mahe",
  RE: "Indian/Reunion",
  YT: "Indian/Mayotte",
  GP: "America/Guadeloupe",
  MQ: "America/Martinique",
  GF: "America/Cayenne",
  NC: "Pacific/Noumea",
  PF: "Pacific/Tahiti",
  AE: "Asia/Dubai",
  QA: "Asia/Qatar",
  BH: "Asia/Bahrain",
  KW: "Asia/Kuwait",
  SA: "Asia/Riyadh",
  OM: "Asia/Muscat",
  JO: "Asia/Amman",
  LB: "Asia/Beirut",
  IL: "Asia/Jerusalem",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  KH: "Asia/Phnom_Penh",
  LA: "Asia/Vientiane",
  MM: "Asia/Yangon",
  MY: "Asia/Kuala_Lumpur",
  SG: "Asia/Singapore",
  BN: "Asia/Brunei",
  PH: "Asia/Manila",
  HK: "Asia/Hong_Kong",
  MO: "Asia/Macau",
  TW: "Asia/Taipei",
  CN: "Asia/Shanghai",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  IN: "Asia/Kolkata",
  LK: "Asia/Colombo",
  NP: "Asia/Kathmandu",
  MV: "Indian/Maldives",
  PK: "Asia/Karachi",
  BD: "Asia/Dhaka",
  NZ: "Pacific/Auckland",
  FJ: "Pacific/Fiji",
};

/** Aéroports dont le pays a plusieurs fuseaux, ou une exception (Canaries, Açores, Madère). */
const AIRPORT_TZ: Record<string, string> = {
  LPA: "Atlantic/Canary",
  TFN: "Atlantic/Canary",
  TFS: "Atlantic/Canary",
  ACE: "Atlantic/Canary",
  FUE: "Atlantic/Canary",
  SPC: "Atlantic/Canary",
  GMZ: "Atlantic/Canary",
  VDE: "Atlantic/Canary",
  FNC: "Atlantic/Madeira",
  PXO: "Atlantic/Madeira",
  PDL: "Atlantic/Azores",
  TER: "Atlantic/Azores",
  HOR: "Atlantic/Azores",
  SMA: "Atlantic/Azores",
  JFK: "America/New_York",
  EWR: "America/New_York",
  LGA: "America/New_York",
  BOS: "America/New_York",
  PHL: "America/New_York",
  DCA: "America/New_York",
  IAD: "America/New_York",
  BWI: "America/New_York",
  MIA: "America/New_York",
  FLL: "America/New_York",
  MCO: "America/New_York",
  TPA: "America/New_York",
  ATL: "America/New_York",
  CLT: "America/New_York",
  DTW: "America/Detroit",
  ORD: "America/Chicago",
  MDW: "America/Chicago",
  MSP: "America/Chicago",
  STL: "America/Chicago",
  DFW: "America/Chicago",
  DAL: "America/Chicago",
  IAH: "America/Chicago",
  HOU: "America/Chicago",
  AUS: "America/Chicago",
  SAT: "America/Chicago",
  DEN: "America/Denver",
  PHX: "America/Phoenix",
  LAS: "America/Los_Angeles",
  SLC: "America/Denver",
  SEA: "America/Los_Angeles",
  PDX: "America/Los_Angeles",
  SFO: "America/Los_Angeles",
  OAK: "America/Los_Angeles",
  SJC: "America/Los_Angeles",
  LAX: "America/Los_Angeles",
  SAN: "America/Los_Angeles",
  SNA: "America/Los_Angeles",
  BUR: "America/Los_Angeles",
  HNL: "Pacific/Honolulu",
  OGG: "Pacific/Honolulu",
  KOA: "Pacific/Honolulu",
  LIH: "Pacific/Honolulu",
  ANC: "America/Anchorage",
  YUL: "America/Toronto",
  YOW: "America/Toronto",
  YYZ: "America/Toronto",
  YQB: "America/Toronto",
  YVR: "America/Vancouver",
  YYC: "America/Edmonton",
  YEG: "America/Edmonton",
  YWG: "America/Winnipeg",
  YHZ: "America/Halifax",
  YYT: "America/St_Johns",
  SYD: "Australia/Sydney",
  MEL: "Australia/Melbourne",
  BNE: "Australia/Brisbane",
  OOL: "Australia/Brisbane",
  CNS: "Australia/Brisbane",
  PER: "Australia/Perth",
  ADL: "Australia/Adelaide",
  DRW: "Australia/Darwin",
  HBA: "Australia/Hobart",
  CBR: "Australia/Sydney",
  GRU: "America/Sao_Paulo",
  CGH: "America/Sao_Paulo",
  VCP: "America/Sao_Paulo",
  GIG: "America/Sao_Paulo",
  SDU: "America/Sao_Paulo",
  BSB: "America/Sao_Paulo",
  SSA: "America/Bahia",
  REC: "America/Recife",
  FOR: "America/Fortaleza",
  BEL: "America/Belem",
  MAO: "America/Manaus",
  POA: "America/Sao_Paulo",
  CWB: "America/Sao_Paulo",
  FLN: "America/Sao_Paulo",
  MEX: "America/Mexico_City",
  GDL: "America/Mexico_City",
  MTY: "America/Monterrey",
  CUN: "America/Cancun",
  MID: "America/Merida",
  SJD: "America/Mazatlan",
  PVR: "America/Mexico_City",
  TIJ: "America/Tijuana",
  SVO: "Europe/Moscow",
  DME: "Europe/Moscow",
  VKO: "Europe/Moscow",
  LED: "Europe/Moscow",
  AER: "Europe/Moscow",
  OVB: "Asia/Novosibirsk",
  IKT: "Asia/Irkutsk",
  VVO: "Asia/Vladivostok",
  CGK: "Asia/Jakarta",
  SUB: "Asia/Jakarta",
  JOG: "Asia/Jakarta",
  BDO: "Asia/Jakarta",
  MES: "Asia/Jakarta",
  KNO: "Asia/Jakarta",
  DPS: "Asia/Makassar",
  UPG: "Asia/Makassar",
  LOP: "Asia/Makassar",
  LBJ: "Asia/Makassar",
};

/** Fuseau IANA de l’aéroport. Null si le code ou le fuseau est inconnu. */
export function timezoneForIata(code: string | null | undefined): string | null {
  const iata = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) return null;
  if (AIRPORT_TZ[iata]) return AIRPORT_TZ[iata];
  const country = countryForIata(iata);
  return (country && COUNTRY_TZ[country]) || null;
}

function validZone(value: unknown): string | null {
  if (typeof value !== "string" || !value.includes("/")) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** Chiffres de l’horloge, sans le décalage déjà écrit. */
export function civilClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = String(iso).trim().match(LOCAL);
  if (!match) return null;
  const second = (match[4] ?? "00").padStart(2, "0");
  return `${match[1]}T${match[2]}:${match[3]}:${second}`;
}

function offsetAt(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  let hour = pick("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), hour, pick("minute"), pick("second"));
  return asUtc - utcMs;
}

/** Décalage civil (minutes) d’une heure locale dans un fuseau. */
export function zoneOffsetMinutes(clock: string, timeZone: string): number | null {
  const match = clock.match(LOCAL);
  if (!match) return null;
  const year = Number(match[1].slice(0, 4));
  const month = Number(match[1].slice(5, 7));
  const day = Number(match[1].slice(8, 10));
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? 0);
  try {
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
    let instant = utcGuess - offsetAt(utcGuess, timeZone);
    instant = utcGuess - offsetAt(instant, timeZone);
    return Math.round(offsetAt(instant, timeZone) / 60000);
  } catch {
    return null;
  }
}

/**
 * Heure locale telle qu’elle est saisie, avec le décalage de l’aéroport.
 * Les chiffres ne bougent pas : 12:10 à Paris reste 12:10, affiché +01:00 en hiver.
 */
export function localCivilStamp(iso: string | null | undefined, timeZone: string | null | undefined): string | null {
  const clock = civilClock(iso);
  if (!clock) return iso ? String(iso) : null;
  if (!timeZone) return clock;
  const minutes = zoneOffsetMinutes(clock, timeZone);
  if (minutes == null || !Number.isFinite(minutes)) return clock;
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const mins = String(abs % 60).padStart(2, "0");
  return `${clock}${sign}${hours}:${mins}`;
}

/** Heure de fiche : fuseau enregistré, sinon celui de l’aéroport. */
export function dossierFlightStamp(
  iso: string | null | undefined,
  iata: string | null | undefined,
  storedZone: unknown
): string | null {
  if (!iso) return null;
  const zone = validZone(storedZone) || timezoneForIata(iata);
  return localCivilStamp(iso, zone);
}
