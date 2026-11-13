import type { BookingExtract, IngestWarning } from "@/lib/crm/ingest-types";
import { foldName } from "@/lib/crm/person-match";

/** Une carte datée plus tôt que ça, par rapport à la réception du mail, n’est pas créée. */
export const STALE_CARD_DAYS = 30;

const DAY_MS = 86_400_000;

const SAMPLE_PNRS = new Set(["ABC123", "DEF456", "XYZ123", "ABCDE1", "ABCDEFG", "97531XY"]);

const SAMPLE_FLIGHTS = new Set(["1234", "5678", "LX123", "HV5802", "TO3456", "AF123", "UA100"]);

const SAMPLE_TRAVELERS = new Set([
  "john doe",
  "jane doe",
  "john smith",
  "jean dupont",
  "marie dupont",
  "marie durand",
  "pierre durand",
  "paul durand",
  "marie curie",
  "marie dubois",
  "josephine peterson",
  "michael peterson",
]);

const SAMPLE_HOTELS = new Set(["option hoteliere", "the grand hotel", "hotel exemple", "hotel exemples"]);

function compactCode(value: string | null | undefined) {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function codeTokens(value: string | null | undefined) {
  return (value || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

export function isSamplePnr(value: string | null | undefined) {
  return codeTokens(value).some((token) => SAMPLE_PNRS.has(token));
}

export function isSampleFlightNumber(value: string | null | undefined) {
  const code = compactCode(value);
  return Boolean(code) && SAMPLE_FLIGHTS.has(code);
}

export function isSampleHotelName(value: string | null | undefined) {
  const folded = foldName(value);
  if (!folded) return false;
  if (SAMPLE_HOTELS.has(folded)) return true;
  return /\bexemples?\b/.test(folded) || /\bexamples?\b/.test(folded);
}

export function isSampleTravelerName(first: string | null | undefined, last: string | null | undefined) {
  const straight = `${foldName(first)} ${foldName(last)}`.trim();
  const swapped = `${foldName(last)} ${foldName(first)}`.trim();
  if (!straight) return false;
  return SAMPLE_TRAVELERS.has(straight) || SAMPLE_TRAVELERS.has(swapped);
}

function utcDay(value: string | null | undefined) {
  const match = (value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
}

/** Vrai quand la date de la carte est au moins 30 jours avant la réception du mail. */
export function cardDateIsStale(
  cardDate: string | null | undefined,
  receivedAt: string | null | undefined,
  marginDays = STALE_CARD_DAYS
) {
  const card = utcDay(cardDate);
  const received = utcDay(receivedAt);
  if (card == null || received == null) return false;
  return received - card >= marginDays * DAY_MS;
}

function detailString(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value : "";
}

function cardWhen(item: { start_at?: string | null; end_at?: string | null }) {
  return (item.start_at || "").trim() || (item.end_at || "").trim() || "";
}

function personLabel(first: string | null | undefined, last: string | null | undefined) {
  return [first, last].map((part) => (part || "").trim()).filter(Boolean).join(" ");
}

/**
 * Retire les cartes et les voyageurs d’exemple, et les vols ou hôtels datés
 * bien avant le mail. Le reste de l’extrait est conservé. N’écrit rien.
 */
export function screenInboundExtract(
  extract: BookingExtract,
  opts?: { receivedAt?: string | null }
): { extract: BookingExtract; warnings: IngestWarning[] } {
  const warnings: IngestWarning[] = [];
  const receivedAt = opts?.receivedAt || null;
  const items = (extract.items || []).filter((item) => {
    const details = (item.details || {}) as Record<string, unknown>;
    const pnr = [item.confirmation_ref, detailString(details, "pnr")].find((value) => isSamplePnr(value)) || "";
    const flight = detailString(details, "flight_number");
    const hotel = detailString(details, "hotel_name") || item.title;
    if (pnr) {
      warnings.push({ file: "exemple", message: `Exemple écarté : PNR ${compactCode(pnr)}.` });
      return false;
    }
    if (item.kind === "flight" && isSampleFlightNumber(flight)) {
      warnings.push({ file: "exemple", message: `Exemple écarté : vol ${compactCode(flight)}.` });
      return false;
    }
    if (item.kind === "hotel" && isSampleHotelName(hotel)) {
      warnings.push({
        file: "exemple",
        message: `Exemple écarté : hôtel ${(hotel || "").trim()}.`,
      });
      return false;
    }
    const when = cardWhen(item);
    if ((item.kind === "flight" || item.kind === "hotel") && cardDateIsStale(when, receivedAt)) {
      warnings.push({
        file: "date",
        message: `Carte écartée : la date ${when.slice(0, 10)} est antérieure à la réception du mail.`,
      });
      return false;
    }
    return true;
  });

  const travelers = (extract.travelers || []).filter((person) => {
    if (!isSampleTravelerName(person.first_name, person.last_name)) return true;
    const label = personLabel(person.first_name, person.last_name);
    warnings.push({ file: "exemple", message: `Exemple écarté : voyageur ${label}.` });
    return false;
  });

  const customerIsSample = isSampleTravelerName(extract.customer_first_name, extract.customer_last_name);
  if (customerIsSample) {
    const label = personLabel(extract.customer_first_name, extract.customer_last_name);
    if (!warnings.some((warning) => warning.message === `Exemple écarté : voyageur ${label}.`)) {
      warnings.push({ file: "exemple", message: `Exemple écarté : voyageur ${label}.` });
    }
  }

  const start = cardDateIsStale(extract.start_date, receivedAt) ? null : extract.start_date;
  const end = cardDateIsStale(extract.end_date, receivedAt) ? null : extract.end_date;
  if (
    (start !== extract.start_date || end !== extract.end_date) &&
    !warnings.some((warning) => warning.file === "date")
  ) {
    const stale = start !== extract.start_date ? extract.start_date : extract.end_date;
    warnings.push({
      file: "date",
      message: `Date écartée : ${(stale || "").slice(0, 10)} est antérieure à la réception du mail.`,
    });
  }

  return {
    extract: {
      ...extract,
      title: isSampleHotelName(extract.title) ? null : extract.title,
      destination: isSampleHotelName(extract.destination) ? null : extract.destination,
      start_date: start,
      end_date: end,
      customer_first_name: customerIsSample ? null : extract.customer_first_name,
      customer_last_name: customerIsSample ? null : extract.customer_last_name,
      items,
      travelers,
    },
    warnings,
  };
}
