import { z } from "zod";
import { sortItemsByOrder } from "./carnet";
import { redactIngestValue } from "./ingest-redact";
import { mergeExtractItems } from "./item-match";
import { BOOKING_ITEM_KINDS } from "./types";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

const roomSchema = z
  .object({
    room: nullableString,
    type: nullableString,
    guests: nullableString,
    confirmation_ref: nullableString,
  })
  .optional();

const detailsSchema = z
  .object({
    airline: nullableString,
    flight_number: nullableString,
    pnr: nullableString,
    from: nullableString,
    to: nullableString,
    city_from: nullableString,
    city_to: nullableString,
    cabin: nullableString,
    baggage: nullableString,
    terminal: nullableString,
    seat: nullableString,
    hotel_name: nullableString,
    room: nullableString,
    city: nullableString,
    address: nullableString,
    board: nullableString,
    occupancy: nullableString,
    guests: nullableString,
    special_requests: nullableString,
    included: z.array(z.string()).optional(),
    rooms: z.array(roomSchema.unwrap()).optional(),
    pickup: nullableString,
    dropoff: nullableString,
    pickup_note: nullableString,
    vehicle: nullableString,
    driver: nullableString,
    policy_number: nullableString,
    meeting_point: nullableString,
    duration: nullableString,
    notes: nullableString,
    source_file_name: nullableString,
    needs_review: z.boolean().optional(),
  })
  .optional()
  .default({});

export const bookingExtractSchema = z.object({
  document_status: z.enum(["confirmed", "quote", "identity"]).nullable().optional(),
  title: nullableString,
  destination: nullableString,
  start_date: nullableString,
  end_date: nullableString,
  currency: z.string().nullable().optional().default("EUR"),
  total_amount: nullableNumber,
  notes_client: nullableString,
  customer_email: nullableString,
  customer_first_name: nullableString,
  customer_last_name: nullableString,
  items: z
    .array(
      z.object({
        kind: z.enum(BOOKING_ITEM_KINDS).default("fee"),
        title: z.string(),
        supplier: nullableString,
        confirmation_ref: nullableString,
        start_at: nullableString,
        end_at: nullableString,
        amount: nullableNumber,
        details: detailsSchema,
      })
    )
    .default([]),
  travelers: z
    .array(
      z.object({
        first_name: nullableString,
        last_name: nullableString,
      })
    )
    .default([]),
});

export type BookingExtract = z.infer<typeof bookingExtractSchema>;

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

export function isAllowedIngestType(type: string | null | undefined, name: string) {
  const mime = type || guessIngestMime(name);
  return mime === "application/pdf" || mime.startsWith("image/");
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

export function sanitizeExtractedPrices(extract: BookingExtract): BookingExtract {
  const merged = mergeExtractItems(
    (extract.items || []).map((item) => ({ ...item, amount: null }))
  );
  const next: BookingExtract = {
    ...extract,
    total_amount: null,
    items: sortItemsByOrder(merged),
  };
  return redactIngestValue(next);
}

export function openaiApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim() || "";
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
