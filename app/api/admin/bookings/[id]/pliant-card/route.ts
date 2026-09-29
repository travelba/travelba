import { NextResponse } from "next/server";
import { ensureBookingPliantCard } from "@/lib/crm/booking-pliant-card";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { cardLast4, parisIsoDate } from "@/lib/crm/hotel-arrival";
import { parseMoney } from "@/lib/crm/money";
import { bookingCardCeilingCents } from "@/lib/crm/pliant-spend";
import { issuePliantCard, pliantConfigured, readPliantCardSecrets, setPliantCardLimit } from "@/lib/crm/pliant";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking, CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function last4Of(cardId: string) {
  try {
    const secrets = await readPliantCardSecrets(cardId);
    const last4 = cardLast4(secrets.pan);
    return last4.length === 4 ? last4 : null;
  } catch {
    return null;
  }
}

async function reveal(admin: ReturnType<typeof createServiceClient>, bookingId: string) {
  const { data } = await admin
    .from("crm_booking_pliant_cards")
    .select("pliant_card_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  const cardId = (data as { pliant_card_id?: string | null } | null)?.pliant_card_id || "";
  if (!cardId) return jsonError("Aucune carte émise.", 404);
  let secrets: { pan: string; expiry: string; cvc: string };
  try {
    secrets = await readPliantCardSecrets(cardId);
  } catch {
    return jsonError("La carte n’a pas pu être lue.", 502);
  }
  const last4 = cardLast4(secrets.pan);
  if (last4.length === 4) {
    await admin.from("crm_booking_pliant_cards").update({ card_last4: last4 }).eq("booking_id", bookingId);
  }
  return NextResponse.json({ pan: secrets.pan, expiry: secrets.expiry, cvc: secrets.cvc });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const admin = createServiceClient();
  if (body?.action === "card") return reveal(admin, id);

  const cents = bookingCardCeilingCents(parseMoney(body?.amount));
  if (cents == null) return jsonError("Indiquez un plafond entre 1 € et 100 000 €.");

  const { data: booking } = await admin.from("crm_bookings").select("id, reference, end_date, customer_id").eq("id", id).maybeSingle();
  const row = booking as Pick<CrmBooking, "id" | "reference" | "end_date" | "customer_id"> | null;
  if (!row) return jsonError("Dossier introuvable", 404);
  const { data: customer } = await admin
    .from("crm_customers")
    .select("first_name, last_name")
    .eq("id", row.customer_id)
    .maybeSingle();
  const holder = customer as Pick<CrmCustomer, "first_name" | "last_name"> | null;

  const result = await ensureBookingPliantCard({
    db: admin,
    bookingId: row.id,
    firstName: holder?.first_name || "",
    lastName: holder?.last_name || "",
    bookingReference: row.reference,
    endDate: row.end_date,
    ceilingCents: cents,
    today: parisIsoDate(new Date()),
    configured: pliantConfigured(),
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
    cardholderId: process.env.PLIANT_CARDHOLDER_ID || "",
    issue: issuePliantCard,
    updateLimit: setPliantCardLimit,
    readLast4: last4Of,
  });
  if (!result.ok) return jsonError(result.error);
  return NextResponse.json(result);
}
