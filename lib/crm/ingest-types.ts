import { z } from "zod";
import { BOOKING_ITEM_KINDS } from "./types";

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

export function openaiApiKey(raw = process.env.OPENAI_API_KEY) {
  let key = (raw || "").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(key)) key = key.replace(/^bearer\s+/i, "").trim();
  // Valeur collée comme « OPENAI_API_KEY=sk-... » dans le champ Vercel.
  const extracted = key.match(/sk-[A-Za-z0-9_-]{20,}/);
  return extracted ? extracted[0] : "";
}

export function bindGatewayAuth(request: Request) {
  const token = request.headers.get("x-vercel-oidc-token");
  if (token && !process.env.VERCEL_OIDC_TOKEN) {
    process.env.VERCEL_OIDC_TOKEN = token;
  }
}

export function preferAiGateway() {
  // Sur Vercel on passe toujours par AI Gateway : une OPENAI_API_KEY
  // mal collée ne doit plus frapper api.openai.com.
  return Boolean(
    process.env.VERCEL ||
      process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      !openaiApiKey()
  );
}

export function aiGatewayConfigured() {
  // On Vercel the OIDC token is on the request (`x-vercel-oidc-token`),
  // not always in process.env.VERCEL_OIDC_TOKEN — the AI SDK still picks it up.
  return Boolean(
    openaiApiKey() ||
      process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.VERCEL
  );
}
