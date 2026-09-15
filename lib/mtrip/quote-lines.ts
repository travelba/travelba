import type { MtripGuideExtraction, QuoteLine } from "@/lib/mtrip/guide-types";

/** Parse montants FR/EN : 1 234,56 € · 1234.56 EUR · Total: 890 */
export function moneyFromText(text: string): {
  amount: number | null;
  currency: string | null;
} {
  if (!text) return { amount: null, currency: null };

  const currencyGuess =
    text.match(/\b(EUR|USD|GBP|CHF)\b/i)?.[1]?.toUpperCase() ||
    (text.includes("€") ? "EUR" : text.includes("$") ? "USD" : null);

  const patterns = [
    /(?:total\s*(?:ttc|ht)?|montant|prix|amount|price|grand\s*total|à\s*payer)[:\s]*([0-9][0-9\s.,]{0,14})\s*(?:€|EUR|USD|\$|GBP|CHF)?/gi,
    /([0-9][0-9\s.,]{1,14})\s*(?:€|EUR)\b/gi,
    /(?:EUR|USD|GBP|CHF)\s*([0-9][0-9\s.,]{1,14})/gi,
    /\$\s*([0-9][0-9\s.,]{1,14})/gi,
  ];

  const candidates: number[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = parseMoneyToken(m[1]);
      if (n != null && n > 0 && n < 1_000_000) candidates.push(n);
    }
  }

  if (!candidates.length) return { amount: null, currency: currencyGuess };

  // Préférer le plus grand montant plausible (total) plutôt qu’un acomptes
  const amount = Math.max(...candidates);
  return { amount, currency: currencyGuess || "EUR" };
}

function parseMoneyToken(raw: string): number | null {
  let s = raw.replace(/\s/g, "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56 ; 1234,56 → 1234.56
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    const parts = s.split(",");
    s =
      parts.length === 2 && parts[1].length <= 2
        ? `${parts[0].replace(/\./g, "")}.${parts[1]}`
        : s.replace(/,/g, "");
  }
  const amount = Number.parseFloat(s);
  return Number.isFinite(amount) ? amount : null;
}

const FR_MONTHS: Record<string, string> = {
  jan: "01",
  janv: "01",
  january: "01",
  fev: "02",
  fév: "02",
  feb: "02",
  february: "02",
  mar: "03",
  mars: "03",
  march: "03",
  avr: "04",
  apr: "04",
  april: "04",
  mai: "05",
  may: "05",
  juin: "06",
  jun: "06",
  june: "06",
  juil: "07",
  jul: "07",
  july: "07",
  aou: "08",
  aoû: "08",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  déc: "12",
  december: "12",
};

export function parseLooseDate(
  value?: string | null,
  defaultYear?: number
): string | null {
  if (!value) return null;
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const frNum = value.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
  if (frNum) {
    const dd = frNum[1].padStart(2, "0");
    const mm = frNum[2].padStart(2, "0");
    let yy = Number(frNum[3]);
    if (frNum[3].length === 2) yy = yy >= 50 ? 1900 + yy : 2000 + yy;
    return `${yy}-${mm}-${dd}`;
  }

  const frWord = value.match(
    /(\d{1,2})\s+(janv?\.?|févr?\.?|fev\.?|mars|avr\.?|mai|juin|juil\.?|août\.?|aout\.?|sept?\.?|oct\.?|nov\.?|déc\.?|dec\.?|january|february|march|april|may|june|july|august|september|october|november|december)\s*\.?(?:\s+(\d{4}))?/i
  );
  if (frWord) {
    const key = frWord[2]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\./g, "")
      .toLowerCase()
      .slice(0, 4);
    const mm =
      FR_MONTHS[key] ||
      FR_MONTHS[key.slice(0, 3)] ||
      FR_MONTHS[frWord[2].toLowerCase().replace(/\./g, "").slice(0, 3)];
    if (!mm) return null;
    const yy = frWord[3]
      ? Number(frWord[3])
      : defaultYear || new Date().getFullYear();
    return `${yy}-${mm}-${frWord[1].padStart(2, "0")}`;
  }

  return null;
}

/** Ex. « ven. 9 oct. - dim. 11 oct. » */
export function parseFrenchDateRange(
  text: string,
  defaultYear?: number
): { start: string | null; end: string | null } {
  const m = text.match(
    /(?:lun|mar|mer|jeu|ven|sam|dim)\.?\s+(\d{1,2})\s+(janv?|févr?|fev|mars|avr|mai|juin|juil|août|aout|sept?|oct|nov|déc|dec)\.?\s*[-–—à]+\s*(?:lun|mar|mer|jeu|ven|sam|dim)\.?\s+(\d{1,2})\s+(janv?|févr?|fev|mars|avr|mai|juin|juil|août|aout|sept?|oct|nov|déc|dec)\.?/i
  );
  if (!m) return { start: null, end: null };
  const year = defaultYear || new Date().getFullYear();
  return {
    start: parseLooseDate(`${m[1]} ${m[2]} ${year}`, year),
    end: parseLooseDate(`${m[3]} ${m[4]} ${year}`, year),
  };
}

/** Construit / fusionne des lignes de devis depuis l’extraction PDF. */
export function quoteLinesFromExtraction(
  extraction: MtripGuideExtraction,
  documentId: string,
  fileName: string,
  existing: QuoteLine[] = [],
  fullText?: string
): QuoteLine[] {
  const next = [...existing];
  const preview =
    fullText ||
    extraction.raw_texts?.find((r) => r.document_id === documentId)?.preview ||
    "";
  const { amount, currency } = moneyFromText(preview);
  const yearHint =
    Number(preview.match(/\b(20\d{2})\b/)?.[1]) || new Date().getFullYear();
  const range = parseFrenchDateRange(preview, yearHint);

  const push = (line: Omit<QuoteLine, "id">) => {
    const conf = (line.confirmation || "").toUpperCase();
    const dup = conf
      ? next.findIndex((l) => (l.confirmation || "").toUpperCase() === conf)
      : -1;
    const row: QuoteLine = {
      id: dup >= 0 ? next[dup].id : crypto.randomUUID(),
      ...line,
      amount: line.amount !== undefined ? line.amount : amount,
      currency: line.currency || currency || "EUR",
      start_date: line.start_date || range.start,
      end_date: line.end_date || range.end,
      document_id: documentId,
      source_file: fileName,
    };
    if (dup >= 0) next[dup] = { ...next[dup], ...row, id: next[dup].id };
    else next.push(row);
  };

  for (const hotel of extraction.hotels || []) {
    if (!hotel.name && !hotel.booking_reference) continue;
    const hotelAmount =
      typeof hotel.amount === "number"
        ? hotel.amount
        : typeof hotel.total === "number"
          ? hotel.total
          : null;
    push({
      kind: "hotel",
      title: String(hotel.name || "Hôtel"),
      confirmation: hotel.booking_reference
        ? String(hotel.booking_reference)
        : null,
      start_date: parseLooseDate(
        typeof hotel.check_in === "string" ? hotel.check_in : null,
        yearHint
      ),
      end_date: parseLooseDate(
        typeof hotel.check_out === "string" ? hotel.check_out : null,
        yearHint
      ),
      amount: hotelAmount,
      currency:
        typeof hotel.currency === "string" ? hotel.currency : currency || "EUR",
      room_type:
        typeof hotel.room_type === "string" ? hotel.room_type : null,
      room_details:
        typeof hotel.room_details === "string" ? hotel.room_details : null,
    });
  }

  for (const flight of extraction.flights || []) {
    const codes = Array.isArray(flight.flight_codes)
      ? flight.flight_codes.map(String)
      : [];
    const pnrs = Array.isArray(flight.pnrs) ? flight.pnrs.map(String) : [];
    const tickets = Array.isArray(flight.tickets)
      ? flight.tickets.map(String)
      : [];
    const routes = Array.isArray(flight.routes)
      ? (flight.routes as Array<{ from: string; to: string }>)
      : [];
    const airline =
      typeof flight.airline === "string" ? flight.airline : null;
    const route = routes[0];
    let title: string;
    if (route && airline) title = `Vol ${airline} ${route.from}–${route.to}`;
    else if (route) title = `Vol ${route.from}–${route.to}`;
    else if (codes.length && airline)
      title = `Vol ${airline} (${codes.slice(0, 2).join(", ")})`;
    else if (codes.length) title = `Vol ${codes.join(", ")}`;
    else if (airline) title = `Vol ${airline}`;
    else title = `Vol — ${fileName.replace(/\.[^.]+$/, "")}`;

    const dep =
      typeof flight.departure_date === "string"
        ? parseLooseDate(flight.departure_date, yearHint)
        : null;
    const arr =
      typeof flight.arrival_date === "string"
        ? parseLooseDate(flight.arrival_date, yearHint)
        : null;

    const flightType =
      typeof flight.flight_type === "string"
        ? flight.flight_type
        : codes[0]
          ? [
              codes[0],
              typeof flight.cabin === "string" ? flight.cabin : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : null;

    const flightDetails =
      typeof flight.flight_details === "string"
        ? flight.flight_details
        : null;

    push({
      kind: "flight",
      title,
      confirmation: pnrs[0] || tickets[0] || null,
      start_date: dep || range.start,
      end_date: arr || dep || range.end,
      amount: undefined,
      room_type: flightType,
      room_details: flightDetails,
    });
  }

  if (
    !(extraction.hotels || []).length &&
    !(extraction.flights || []).length
  ) {
    const fromFile = fileName.replace(/\.[^.]+$/, "");
    const looksLikeScreenshot =
      /capture\s*d['’]?\s*e[́e]?cran|screenshot|img[-_]?\d{5,}/i.test(
        fromFile
      );
    push({
      kind: "other",
      title: looksLikeScreenshot
        ? "Confirmation de réservation"
        : fromFile,
      confirmation: null,
      start_date: range.start,
      end_date: range.end,
      amount,
      currency: currency || "EUR",
    });
  }

  return next;
}

export function inferTripDates(lines: QuoteLine[]): {
  start_date: string | null;
  end_date: string | null;
} {
  const starts = lines
    .map((l) => l.start_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const ends = lines
    .map((l) => l.end_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  return {
    start_date: starts[0] || null,
    end_date: ends[ends.length - 1] || null,
  };
}

export function destinationFromLines(lines: QuoteLine[], fallback: string) {
  // Conservé pour compat — préférer buildVoyageTitle
  const hotel = lines.find((l) => l.kind === "hotel" && l.title);
  return hotel?.title || fallback;
}

export function emptyQuoteLine(): QuoteLine {
  return {
    id: crypto.randomUUID(),
    kind: "hotel",
    title: "",
    confirmation: null,
    start_date: null,
    end_date: null,
    amount: null,
    currency: "EUR",
    room_type: null,
    room_details: null,
  };
}

/** Affichage séjour : `10 juin - 11 juin` */
const MONTHS_FULL_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export function formatStayDateRangeFr(
  start?: string | null,
  end?: string | null
): string | null {
  if (!start) return null;
  const a = parseYmdLocal(start);
  if (!a) return null;
  const left = `${a.getDate()} ${MONTHS_FULL_FR[a.getMonth()]}`;
  if (!end) return left;
  const b = parseYmdLocal(end);
  if (!b) return left;
  if (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  ) {
    return left;
  }
  const right = `${b.getDate()} ${MONTHS_FULL_FR[b.getMonth()]}`;
  if (a.getFullYear() !== b.getFullYear()) {
    return `${left} ${a.getFullYear()} - ${right} ${b.getFullYear()}`;
  }
  return `${left} - ${right}`;
}

function parseYmdLocal(value: string): Date | null {
  const m = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
