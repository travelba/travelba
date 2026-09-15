import type {
  AgencyMtripGuide,
  MtripGuideExtraction,
  QuoteLine,
} from "@/lib/mtrip/guide-types";
import { inferTripDates } from "@/lib/mtrip/quote-lines";

export type TripDestinationLabel = {
  city: string;
  country: string;
  countryCode?: string;
};

const MONTH_SHORT_FR = [
  "janv",
  "févr",
  "mars",
  "avr",
  "mai",
  "juin",
  "juil",
  "août",
  "sept",
  "oct",
  "nov",
  "déc",
] as const;

const COUNTRY_FR: Record<string, string> = {
  FR: "France",
  MA: "Maroc",
  PA: "Panama",
  US: "États-Unis",
  GB: "Royaume-Uni",
  ES: "Espagne",
  IT: "Italie",
  PT: "Portugal",
  DE: "Allemagne",
  CH: "Suisse",
  BE: "Belgique",
  NL: "Pays-Bas",
  AE: "Émirats arabes unis",
  QA: "Qatar",
  TR: "Turquie",
  TH: "Thaïlande",
  GR: "Grèce",
  HR: "Croatie",
  MX: "Mexique",
  BR: "Brésil",
  JP: "Japon",
  SN: "Sénégal",
  MU: "Maurice",
  SC: "Seychelles",
  MV: "Maldives",
};

/** Aéroports → ville / pays (sous-ensemble utile CRM). */
const IATA_CITY: Record<string, { city: string; country: string }> = {
  CDG: { city: "Paris", country: "FR" },
  ORY: { city: "Paris", country: "FR" },
  LYS: { city: "Lyon", country: "FR" },
  NCE: { city: "Nice", country: "FR" },
  MRS: { city: "Marseille", country: "FR" },
  RAK: { city: "Marrakech", country: "MA" },
  CMN: { city: "Casablanca", country: "MA" },
  AGA: { city: "Agadir", country: "MA" },
  PTY: { city: "Panama City", country: "PA" },
  BOC: { city: "Bocas del Toro", country: "PA" },
  JFK: { city: "New York", country: "US" },
  EWR: { city: "New York", country: "US" },
  LHR: { city: "Londres", country: "GB" },
  LGW: { city: "Londres", country: "GB" },
  MAD: { city: "Madrid", country: "ES" },
  BCN: { city: "Barcelone", country: "ES" },
  FCO: { city: "Rome", country: "IT" },
  MXP: { city: "Milan", country: "IT" },
  LIS: { city: "Lisbonne", country: "PT" },
  DXB: { city: "Dubaï", country: "AE" },
  DOH: { city: "Doha", country: "QA" },
  IST: { city: "Istanbul", country: "TR" },
  BKK: { city: "Bangkok", country: "TH" },
  ATH: { city: "Athènes", country: "GR" },
  CUN: { city: "Cancún", country: "MX" },
  DSS: { city: "Dakar", country: "SN" },
  MRU: { city: "Maurice", country: "MU" },
};

const CITY_HINTS: Array<{
  re: RegExp;
  city: string;
  country: string;
}> = [
  { re: /marrakech|marrakesh|\brak\b/i, city: "Marrakech", country: "MA" },
  { re: /casablanca|\bcmn\b/i, city: "Casablanca", country: "MA" },
  { re: /agadir|\baga\b/i, city: "Agadir", country: "MA" },
  { re: /bocas/i, city: "Bocas del Toro", country: "PA" },
  { re: /panama/i, city: "Panama City", country: "PA" },
  { re: /\bparis\b|\bcdg\b|\bory\b/i, city: "Paris", country: "FR" },
  { re: /\blyon\b/i, city: "Lyon", country: "FR" },
  { re: /\bnice\b/i, city: "Nice", country: "FR" },
  { re: /londres|london/i, city: "Londres", country: "GB" },
  { re: /new\s*york|\bjfk\b/i, city: "New York", country: "US" },
  { re: /madrid/i, city: "Madrid", country: "ES" },
  { re: /barcelone|barcelona/i, city: "Barcelone", country: "ES" },
  { re: /\brome\b|roma/i, city: "Rome", country: "IT" },
  { re: /milan|milano/i, city: "Milan", country: "IT" },
  { re: /lisbonne|lisbon/i, city: "Lisbonne", country: "PT" },
  { re: /duba[iï]/i, city: "Dubaï", country: "AE" },
  { re: /canc[uú]n/i, city: "Cancún", country: "MX" },
  { re: /dakar/i, city: "Dakar", country: "SN" },
];

/** Départs France fréquents — exclus si d’autres destinations existent. */
const HOME_CITIES = new Set(["paris", "lyon", "nice", "marseille"]);

function countryLabel(code: string): string {
  return COUNTRY_FR[code.toUpperCase()] || code.toUpperCase();
}

function normalizeCityKey(city: string) {
  return city
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function pushDest(
  map: Map<string, TripDestinationLabel>,
  city: string,
  countryCode: string
) {
  const clean = city.trim();
  if (!clean) return;
  const key = normalizeCityKey(clean);
  if (map.has(key)) return;
  map.set(key, {
    city: clean,
    country: countryLabel(countryCode),
    countryCode: countryCode.toUpperCase(),
  });
}

function hintFromText(text: string): TripDestinationLabel | null {
  for (const h of CITY_HINTS) {
    if (h.re.test(text)) {
      return {
        city: h.city,
        country: countryLabel(h.country),
        countryCode: h.country,
      };
    }
  }
  return null;
}

function iataFromText(text: string): string[] {
  const found: string[] = [];
  const pairs = text.matchAll(/\b([A-Z]{3})\s*[–\-↔→\/]\s*([A-Z]{3})\b/gi);
  for (const m of pairs) {
    found.push(m[1].toUpperCase(), m[2].toUpperCase());
  }
  const solo = text.matchAll(/\b([A-Z]{3})\b/g);
  for (const m of solo) {
    const code = m[1].toUpperCase();
    if (IATA_CITY[code]) found.push(code);
  }
  return [...new Set(found)];
}

/**
 * Dates voyage au format demandé : `10 sept - 11 sept`
 * (jour sans zéro, mois abrégé FR, tiret espacé).
 */
export function formatTripDateRange(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  if (!start) return null;
  const a = parseYmd(start);
  if (!a) return null;
  const b = end ? parseYmd(end) : null;
  const left = formatDayMonth(a);
  if (!b) return left;
  const right = formatDayMonth(b);
  if (a.getFullYear() !== b.getFullYear()) {
    return `${left} ${a.getFullYear()} - ${right} ${b.getFullYear()}`;
  }
  return `${left} - ${right}`;
}

function parseYmd(value: string): Date | null {
  const m = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDayMonth(d: Date) {
  return `${d.getDate()} ${MONTH_SHORT_FR[d.getMonth()]}`;
}

/** Collecte toutes les villes/pays de destination (hôtels + arrivées vols). */
export function collectTripDestinations(input: {
  quote_lines?: QuoteLine[] | null;
  extraction?: MtripGuideExtraction | null;
  title?: string | null;
}): TripDestinationLabel[] {
  const map = new Map<string, TripDestinationLabel>();
  const hotelCities = new Map<string, TripDestinationLabel>();

  for (const h of input.extraction?.hotels || []) {
    const raw = h as Record<string, unknown>;
    const name = String(raw.name || raw.hotel_name || "");
    const cityRaw = String(raw.city || "").trim();
    const countryRaw = String(raw.country || raw.country_code || "").trim();
    if (cityRaw) {
      const code =
        countryRaw.length === 2
          ? countryRaw.toUpperCase()
          : hintFromText(`${cityRaw} ${name}`)?.countryCode || "XX";
      pushDest(hotelCities, cityRaw, code === "XX" ? "FR" : code);
      continue;
    }
    const hinted = hintFromText(name);
    if (hinted) {
      pushDest(hotelCities, hinted.city, hinted.countryCode || "FR");
    }
  }

  for (const line of input.quote_lines || []) {
    if (line.kind === "hotel" || line.kind === "other") {
      const hinted = hintFromText(line.title || "");
      if (hinted) pushDest(hotelCities, hinted.city, hinted.countryCode || "FR");
    }
  }

  // Vols : aéroports d’arrivée (et paires IATA dans les titres)
  const flightArrivals = new Map<string, TripDestinationLabel>();
  for (const raw of input.extraction?.flights || []) {
    const routes = Array.isArray(raw.routes) ? raw.routes : [];
    for (const r of routes) {
      if (!r || typeof r !== "object") continue;
      const to = String((r as { to?: unknown }).to || "").toUpperCase();
      if (to && IATA_CITY[to]) {
        const m = IATA_CITY[to];
        pushDest(flightArrivals, m.city, m.country);
      }
    }
    const from = String(
      (raw as { arrival_city?: unknown }).arrival_city ||
        (raw as { to_city?: unknown }).to_city ||
        ""
    );
    if (from) {
      const hinted = hintFromText(from);
      if (hinted) pushDest(flightArrivals, hinted.city, hinted.countryCode || "FR");
    }
  }

  for (const line of input.quote_lines || []) {
    if (line.kind !== "flight") continue;
    const codes = iataFromText(line.title || "");
    // Paire A–B : on garde B (arrivée) ; si plusieurs segments, tous les codes hors domicile FR si possible
    if (codes.length >= 2) {
      const arrivals = codes.filter((_, i) => i % 2 === 1);
      for (const code of arrivals.length ? arrivals : codes.slice(1)) {
        const m = IATA_CITY[code];
        if (m) pushDest(flightArrivals, m.city, m.country);
      }
    } else {
      for (const code of codes) {
        const m = IATA_CITY[code];
        if (m) pushDest(flightArrivals, m.city, m.country);
      }
    }
    const hinted = hintFromText(line.title || "");
    if (hinted) pushDest(flightArrivals, hinted.city, hinted.countryCode || "FR");
  }

  if (input.title) {
    const hinted = hintFromText(input.title);
    if (hinted) pushDest(map, hinted.city, hinted.countryCode || "FR");
  }

  // Priorité hôtels (villes de séjour) ; sinon arrivées vols
  const source = hotelCities.size ? hotelCities : flightArrivals;
  for (const [k, v] of source) map.set(k, v);

  let list = [...map.values()];

  // Si plusieurs destinations et Paris/Lyon = domicile, on les retire
  if (list.length > 1) {
    const withoutHome = list.filter(
      (d) => !HOME_CITIES.has(normalizeCityKey(d.city))
    );
    if (withoutHome.length) list = withoutHome;
  }

  return list;
}

/**
 * Titre voyage standard TBA :
 * `Marrakech, Maroc · Casablanca, Maroc · 10 sept - 17 sept`
 */
export function buildVoyageTitle(input: {
  start_date?: string | null;
  end_date?: string | null;
  quote_lines?: QuoteLine[] | null;
  extraction?: MtripGuideExtraction | null;
  currentTitle?: string | null;
  fallback?: string | null;
}): string {
  const datesFromLines = inferTripDates(input.quote_lines || []);
  const start = input.start_date || datesFromLines.start_date;
  const end = input.end_date || datesFromLines.end_date;
  const datePart = formatTripDateRange(start, end);

  const destinations = collectTripDestinations({
    quote_lines: input.quote_lines,
    extraction: input.extraction,
    title: input.currentTitle,
  });

  const destPart = destinations
    .map((d) => `${d.city}, ${d.country}`)
    .join(" · ");

  if (destPart && datePart) return `${destPart} · ${datePart}`;
  if (destPart) return destPart;
  if (datePart) return datePart;

  const cur = (input.currentTitle || "").trim();
  if (cur && cur !== "Nouveau voyage" && !/^Voyage\s+/i.test(cur)) {
    return cur;
  }
  return (input.fallback || "Nouveau voyage").trim() || "Nouveau voyage";
}

export function buildVoyageTitleFromGuide(
  guide: Pick<
    AgencyMtripGuide,
    "title" | "start_date" | "end_date" | "quote_lines" | "extraction"
  >
) {
  return buildVoyageTitle({
    start_date: guide.start_date,
    end_date: guide.end_date,
    quote_lines: guide.quote_lines,
    extraction: guide.extraction,
    currentTitle: guide.title,
  });
}
