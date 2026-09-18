import { z } from "zod";
import { sortItemsByOrder } from "./carnet";
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

export function sanitizeExtractedPrices(extract: BookingExtract): BookingExtract {
  return {
    ...extract,
    total_amount: null,
    items: sortItemsByOrder((extract.items || []).map((item) => ({ ...item, amount: null }))),
  };
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
