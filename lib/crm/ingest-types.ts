import { z } from "zod";
import { BOOKING_ITEM_KINDS } from "@/lib/crm/types";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

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
        details: z
          .object({
            airline: nullableString,
            flight_number: nullableString,
            pnr: nullableString,
            from: nullableString,
            to: nullableString,
            cabin: nullableString,
            hotel_name: nullableString,
            room: nullableString,
            address: nullableString,
            pickup: nullableString,
            dropoff: nullableString,
            policy_number: nullableString,
            notes: nullableString,
          })
          .optional()
          .default({}),
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

export function aiGatewayConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}
