import type { BookingExtract, IngestWarning } from "@/lib/crm/ingest-types";
import { foldName } from "@/lib/crm/person-match";

/** Une carte datée plus tôt que ça, par rapport à la réception du mail, n’est pas créée. */
export const STALE_CARD_DAYS = 30;

/** Toute carte née d’un mail reste à vérifier, et cachée au client. */
export const MAIL_REVIEW_REASON = "À vérifier avant de montrer au client.";

export function preparedLooksLikeImage(file: { name?: string | null; type?: string | null; text?: string | null }) {
  if (typeof file.text === "string") return false;
  const name = file.name || "";
  const mime = file.type || "";
  return /^image\//i.test(mime) || /\.(png|jpe?g|gif|webp|heic)$/i.test(name);
}

export function preparedLooksLikePdf(file: { name?: string | null; type?: string | null; text?: string | null }) {
  if (typeof file.text === "string") return false;
  const name = file.name || "";
  const mime = file.type || "";
  return mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

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

function personTokens(first: string | null | undefined, last: string | null | undefined) {
  return `${foldName(first)} ${foldName(last)}`
    .split(" ")
    .filter((token) => token.length >= 2);
}

/** Le code, tel quel, est dans le texte (casse et séparateurs ignorés). */
export function codeAppearsInText(code: string | null | undefined, source: string) {
  const token = compactCode(code);
  if (token.length < 4) return false;
  return compactCode(source).includes(token);
}

/** Prénom et nom sont écrits dans le texte, pas seulement devinés. */
export function personAppearsInText(
  first: string | null | undefined,
  last: string | null | undefined,
  source: string
) {
  const tokens = personTokens(first, last);
  if (tokens.length < 2) return false;
  const folded = foldName(source);
  return tokens.every((token) => folded.includes(token));
}

function itemCodes(item: BookingExtract["items"][number]) {
  const details = (item.details || {}) as Record<string, unknown>;
  return [item.confirmation_ref, detailString(details, "pnr")].filter((value): value is string => Boolean(value && value.trim()));
}

function fromImageFile(item: BookingExtract["items"][number]) {
  const details = (item.details || {}) as Record<string, unknown>;
  return preparedLooksLikeImage({ name: detailString(details, "source_file_name") });
}

function textCorroborates(source: string, extract: BookingExtract) {
  if (!source.trim()) return false;
  for (const item of extract.items || []) {
    if (itemCodes(item).some((code) => codeAppearsInText(code, source))) return true;
  }
  for (const person of extract.travelers || []) {
    if (personAppearsInText(person.first_name, person.last_name, source)) return true;
  }
  return personAppearsInText(extract.customer_first_name, extract.customer_last_name, source);
}

function stampMailCard(item: BookingExtract["items"][number]): BookingExtract["items"][number] {
  const details = { ...(item.details || {}) } as Record<string, unknown>;
  const reason = typeof details.review_reason === "string" ? details.review_reason.trim() : "";
  details.needs_review = true;
  details.review_reason = reason || MAIL_REVIEW_REASON;
  details.client_hidden = true;
  return { ...item, details: details as BookingExtract["items"][number]["details"] };
}

/**
 * Retire les cartes et les voyageurs d’exemple, les dates trop anciennes,
 * les lectures d’image sans texte, et toute valeur absente du texte source.
 * Les cartes qui restent sont à vérifier et cachées au client. N’écrit rien.
 */
export function screenInboundExtract(
  extract: BookingExtract,
  opts?: { receivedAt?: string | null; sourceText?: string | null; corroborationText?: string | null; imageOnly?: boolean }
): { extract: BookingExtract; warnings: IngestWarning[] } {
  const warnings: IngestWarning[] = [];
  const receivedAt = opts?.receivedAt || null;
  const trusted = opts?.sourceText ?? null;
  const corroboration = opts?.corroborationText ?? opts?.sourceText ?? null;
  if (opts?.imageOnly && !textCorroborates(corroboration || "", extract)) {
    if ((extract.items || []).length || (extract.travelers || []).length) {
      warnings.push({
        file: "image",
        message: "Image seule : aucune carte n’est créée sans un PNR, une confirmation ou un voyageur écrit dans le mail ou un PDF.",
      });
    }
    return {
      extract: {
        ...extract,
        items: [],
        travelers: [],
        customer_first_name: null,
        customer_last_name: null,
      },
      warnings,
    };
  }
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
    if (trusted != null) {
      const codes = itemCodes(item).filter((code) => compactCode(code).length >= 4);
      const missing = codes.find((code) => !codeAppearsInText(code, trusted));
      if (missing) {
        warnings.push({
          file: "texte",
          message: `Valeur absente du texte : ${compactCode(missing)}.`,
        });
        return false;
      }
      const imageCard = opts?.imageOnly || fromImageFile(item);
      const grounded = codes.some((code) => codeAppearsInText(code, corroboration || trusted));
      if (imageCard && !grounded) {
        warnings.push({
          file: "image",
          message: "Image seule : la carte n’est pas créée sans confirmation écrite dans le mail ou un PDF.",
        });
        return false;
      }
    }
    return true;
  });

  const travelers = (extract.travelers || []).filter((person) => {
    const label = personLabel(person.first_name, person.last_name);
    if (isSampleTravelerName(person.first_name, person.last_name)) {
      warnings.push({ file: "exemple", message: `Exemple écarté : voyageur ${label}.` });
      return false;
    }
    if (trusted != null && label && !personAppearsInText(person.first_name, person.last_name, trusted)) {
      warnings.push({ file: "texte", message: `Valeur absente du texte : voyageur ${label}.` });
      return false;
    }
    return true;
  });

  const customerLabel = personLabel(extract.customer_first_name, extract.customer_last_name);
  const customerIsSample = isSampleTravelerName(extract.customer_first_name, extract.customer_last_name);
  const customerMissing =
    trusted != null &&
    customerLabel &&
    !personAppearsInText(extract.customer_first_name, extract.customer_last_name, trusted);
  if (customerIsSample || customerMissing) {
    const message = customerIsSample
      ? `Exemple écarté : voyageur ${customerLabel}.`
      : `Valeur absente du texte : voyageur ${customerLabel}.`;
    if (!warnings.some((warning) => warning.message === message)) {
      warnings.push({ file: customerIsSample ? "exemple" : "texte", message });
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
      customer_first_name: customerIsSample || customerMissing ? null : extract.customer_first_name,
      customer_last_name: customerIsSample || customerMissing ? null : extract.customer_last_name,
      items: items.map(stampMailCard),
      travelers,
    },
    warnings,
  };
}
