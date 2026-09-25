import { z } from "zod";
import { productionOnlySecret } from "./preview-secrets";
import { bookingTotalFromItems } from "./bookings";
import { sortItemsByOrder } from "./carnet";
import { redactIngestValue } from "./ingest-redact";
import { mergeExtractItems } from "./item-match";
import { parseMoney } from "./money";
import { INGEST_ITEM_KINDS, type BookingStatus } from "./types";

const looseString = z.string().nullable().optional();
const looseNumber = z.number().nullable().optional();

const roomSchemaLoose = z
  .object({
    room: looseString,
    type: looseString,
    guests: looseString,
    confirmation_ref: looseString,
    party_keys: z.array(z.string()).optional(),
  })
  .optional();

const detailsSchemaLoose = z
  .object({
    airline: looseString,
    airline_iata: looseString,
    flight_number: looseString,
    pnr: looseString,
    from: looseString,
    to: looseString,
    city_from: looseString,
    city_to: looseString,
    cabin: looseString,
    baggage: looseString,
    terminal: looseString,
    seat: looseString,
    hotel_name: looseString,
    room: looseString,
    city: looseString,
    address: looseString,
    website: looseString,
    phone: looseString,
    email: looseString,
    source_family: looseString,
    board: looseString,
    occupancy: looseString,
    guests: looseString,
    special_requests: looseString,
    included: z.array(z.string()).optional(),
    rooms: z.array(roomSchemaLoose.unwrap()).optional(),
    pickup: looseString,
    dropoff: looseString,
    pickup_note: looseString,
    vehicle: looseString,
    driver: looseString,
    policy_number: looseString,
    meeting_point: looseString,
    duration: looseString,
    notes: looseString,
    source_file_name: looseString,
    needs_review: z.boolean().nullable().optional(),
    document_amount: looseNumber,
    document_currency: looseString,
    ticket_count: looseNumber,
    passengers: z
      .array(
        z.object({
          first_name: looseString,
          last_name: looseString,
        })
      )
      .optional(),
  })
  .optional()
  .default({});

/** Validation souple (saisie agent / save). */
export const bookingExtractSchema = z.object({
  document_status: z.enum(["confirmed", "quote", "identity", "cancelled"]).nullable().optional(),
  title: looseString,
  destination: looseString,
  start_date: looseString,
  end_date: looseString,
  currency: z.string().nullable().optional().default("EUR"),
  total_amount: looseNumber,
  notes_client: looseString,
  customer_email: looseString,
  customer_first_name: looseString,
  customer_last_name: looseString,
  items: z
    .array(
      z.object({
        kind: z.enum(INGEST_ITEM_KINDS).default("fee"),
        title: z.string(),
        supplier: looseString,
        confirmation_ref: looseString,
        start_at: looseString,
        end_at: looseString,
        amount: looseNumber,
        include_in_ledger: z.boolean().optional(),
        details: detailsSchemaLoose,
      })
    )
    .default([]),
  travelers: z
    .array(
      z.object({
        first_name: looseString,
        last_name: looseString,
        companion_id: looseString,
        is_account_holder: z.boolean().nullable().optional(),
      })
    )
    .default([]),
});

export type BookingExtract = z.infer<typeof bookingExtractSchema>;

// OpenAI structured outputs: every property must be in `required`.
const strictString = z.string().nullable();
const strictNumber = z.number().nullable();
const strictBoolean = z.boolean().nullable();

const roomSchemaStrict = z.object({
  room: strictString,
  type: strictString,
  guests: strictString,
  confirmation_ref: strictString,
});

const detailsSchemaStrict = z.object({
  airline: strictString,
  airline_iata: strictString,
  flight_number: strictString,
  pnr: strictString,
  from: strictString,
  to: strictString,
  city_from: strictString,
  city_to: strictString,
  cabin: strictString,
  baggage: strictString,
  terminal: strictString,
  seat: strictString,
  hotel_name: strictString,
  room: strictString,
  city: strictString,
  address: strictString,
  website: strictString,
  phone: strictString,
  email: strictString,
  board: strictString,
  occupancy: strictString,
  guests: strictString,
  special_requests: strictString,
  included: z.array(z.string()),
  rooms: z.array(roomSchemaStrict),
  pickup: strictString,
  dropoff: strictString,
  pickup_note: strictString,
  vehicle: strictString,
  driver: strictString,
  policy_number: strictString,
  meeting_point: strictString,
  duration: strictString,
  notes: strictString,
  source_file_name: strictString,
  needs_review: strictBoolean,
  document_amount: strictNumber,
  document_currency: strictString,
});

/** Schéma strict pour Output.object (OpenAI). */
export const bookingExtractLlmSchema = z.object({
  document_status: z.enum(["confirmed", "quote", "identity", "cancelled"]).nullable(),
  title: strictString,
  destination: strictString,
  start_date: strictString,
  end_date: strictString,
  currency: strictString,
  total_amount: strictNumber,
  notes_client: strictString,
  customer_email: strictString,
  customer_first_name: strictString,
  customer_last_name: strictString,
  items: z.array(
    z.object({
      kind: z.enum(INGEST_ITEM_KINDS),
      title: z.string(),
      supplier: strictString,
      confirmation_ref: strictString,
      start_at: strictString,
      end_at: strictString,
      amount: strictNumber,
      details: detailsSchemaStrict,
    })
  ),
  travelers: z.array(
    z.object({
      first_name: strictString,
      last_name: strictString,
    })
  ),
});

export const MAX_INGEST_BYTES = 25 * 1024 * 1024;
export const MAX_INGEST_FILES = 30;

export type IngestStagedFile = {
  path: string;
  name: string;
  type?: string | null;
};

export type IngestWarning = {
  file: string;
  message: string;
};

export function guessIngestMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

export function isPdfFile(type: string | null | undefined, name: string) {
  const mime = type || guessIngestMime(name);
  return mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

export function isAllowedIngestType(type: string | null | undefined, name: string) {
  if (isPdfFile(type, name)) return true;
  const mime = type || guessIngestMime(name);
  return mime.startsWith("image/");
}

export type IngestStreamEvent =
  | {
      event: "file";
      index: number;
      total: number;
      name: string;
      status: "reading" | "ok" | "error" | "identity";
      family?: string;
      itemCount?: number;
      message?: string;
    }
  | { event: "progress"; done: number; total: number; current?: string }
  | {
      event: "done";
      extract: BookingExtract;
      suggested_customer_id: string | null;
      warnings: IngestWarning[];
    }
  | { event: "fatal"; error: string };

export function emptyBookingExtract(): BookingExtract {
  return {
    document_status: null,
    title: "",
    destination: "",
    start_date: "",
    end_date: "",
    currency: "EUR",
    total_amount: null,
    notes_client: "",
    customer_email: "",
    customer_first_name: "",
    customer_last_name: "",
    items: [],
    travelers: [],
  };
}

function asPositiveMoney(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function textDetail(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Montant du séjour = somme des prix vendus des cartes. Le montant PDF n’entre pas dans ce total. */
export function sellingTotalFromExtract(extract: BookingExtract): number {
  return bookingTotalFromItems(extract.items || []);
}

export function bookingStatusFromExtract(
  extract: BookingExtract,
  fallback: BookingStatus
): BookingStatus {
  if (extract.document_status === "quote") return "quoted";
  if (extract.document_status === "confirmed") return "confirmed";
  if (extract.document_status === "cancelled") return "cancelled";
  return fallback;
}

const CANCEL_POLICY =
  /cancellation policy|free cancellation|conditions d['’]annulation|must be cancelled|annuler ma r[eé]servation|modifier ma r[eé]servation/i;

const CANCEL_EVENT =
  /\b(booking|reservation|r[eé]servation)\s+(has been\s+|was\s+|is\s+)?cancell?ed\b|\bcancellation confirmation\b|\bannulation confirm[eé]e\b|a [eé]t[eé] annul[eée]e?\b|\bcancell?ed (booking|reservation)\b|\byour booking (has been|was) cancell?ed\b|\bbooking cancelled\b|\breservation cancelled\b/i;

/** Vrai mail d’annulation — pas une politique « free cancellation ». */
export function detectCancellationDocument(text: string | null | undefined) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  if (CANCEL_EVENT.test(raw)) return true;
  if (CANCEL_POLICY.test(raw)) return false;
  return /\bannul(?:ation|é|ee|ée)\b/i.test(raw) && /\b(r[eé]servation|booking|confirmation)\b/i.test(raw);
}

export function isCancellationExtract(extract: Pick<BookingExtract, "document_status" | "title" | "notes_client">) {
  if (extract.document_status === "cancelled") return true;
  return detectCancellationDocument(`${extract.title || ""}\n${extract.notes_client || ""}`);
}

/** Carte hôtel : title = nom d’établissement, ville dans details.city. */
export function normalizeHotelExtractItem(
  item: BookingExtract["items"][number]
): BookingExtract["items"][number] {
  if (item.kind !== "hotel") return item;
  const details = { ...(item.details || {}) };
  const hotelName = textDetail(details, "hotel_name");
  const city = textDetail(details, "city");
  const title = String(item.title || "").trim();
  const name =
    hotelName || (title && title.toLowerCase() !== city.toLowerCase() ? title : "");
  if (name) {
    if (!hotelName) details.hotel_name = name;
    return { ...item, title: name, details };
  }
  return { ...item, title: title || city || "Hôtel", details };
}

function keepDocumentPrice(
  item: BookingExtract["items"][number],
  fallbackCurrency: string | null | undefined,
  fallbackAmount: number | null
): BookingExtract["items"][number] {
  const details = { ...(item.details || {}) };
  const existing = asPositiveMoney(details.document_amount);
  const fromItem = asPositiveMoney(item.amount);
  const amount = existing || fromItem || fallbackAmount;
  if (amount) details.document_amount = amount;
  if (!details.document_currency && (amount || details.document_amount)) {
    details.document_currency =
      (typeof details.document_currency === "string" && details.document_currency) ||
      fallbackCurrency ||
      "EUR";
  }
  return { ...item, amount: null, details };
}

/** item.amount reste null à l’extraction. total_amount = somme des prix vendus saisis sur les cartes. */
export function sanitizeExtractedPrices(extract: BookingExtract): BookingExtract {
  const fallbackTotal = asPositiveMoney(extract.total_amount);
  const rawItems = extract.items || [];
  const items = rawItems.map((item, index) =>
    normalizeHotelExtractItem(
      keepDocumentPrice(
        item,
        extract.currency,
        rawItems.length === 1 && index === 0 ? fallbackTotal : null
      )
    )
  );
  const merged = mergeExtractItems(items);
  const priced: BookingExtract = {
    ...extract,
    items: merged,
  };
  const next: BookingExtract = {
    ...extract,
    currency: extract.currency || "EUR",
    total_amount: sellingTotalFromExtract(priced),
    items: sortItemsByOrder(merged),
  };
  return redactIngestValue(next);
}

/** Parse tolérant : renvoie un extract vide si le payload est invalide (jamais d'exception). */
export function parseExtractPayloadSafe(raw: unknown): BookingExtract {
  const parsed = bookingExtractSchema.safeParse(raw);
  if (!parsed.success) return emptyBookingExtract();
  return sanitizeExtractedPrices(parsed.data);
}

/** Prix saisis par l’agent à la relecture. Le net PDF a déjà été retiré en amont. */
export function keepAgentPrices(extract: BookingExtract): BookingExtract {
  const next: BookingExtract = {
    ...extract,
    currency: extract.currency || "EUR",
    total_amount: parseMoney(extract.total_amount),
    items: sortItemsByOrder(
      (extract.items || []).map((item) => ({
        ...item,
        amount: parseMoney(item.amount),
      }))
    ),
  };
  return redactIngestValue(next);
}

export function openaiApiKey() {
  const key = productionOnlySecret(process.env.OPENAI_API_KEY);
  return key.startsWith("sk-") ? key : "";
}

export function aiGatewayConfigured() {
  return Boolean(
    openaiApiKey() ||
      process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.VERCEL
  );
}
