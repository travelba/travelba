import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { carnetVisible } from "@/lib/crm/carnet";
import { recordCustomerActivity } from "@/lib/crm/customer-activity";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";
import { formatEveningFr, type TableSeat, type TableStatus } from "@/lib/crm/restaurants";
import { refuseRestaurantSeat, restaurantsReady, saveBookingChoice } from "@/lib/crm/restaurants-db";
import { createServiceClient } from "@/lib/supabase/admin";
import { type CrmBooking, type CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accepter ou refuser une table depuis le séjour.
 * Même enregistrement que le bouton WhatsApp : l’autre table passe à annuler.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const jar = await cookies();
  if (deskBypass(jar.get(DESK_COOKIE)?.value, auth.user.id)) {
    return jsonError("Cette action se fait depuis votre espace.", 403);
  }
  const { id: reference } = await ctx.params;
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date.slice(0, 10) : "";
  const seat = typeof body?.seat === "string" ? body.seat.toUpperCase() : "";
  const reply = body?.reply === "accepte" || body?.reply === "refuse" ? body.reply : "";
  if (!DATE.test(date) || (seat !== "A" && seat !== "B") || !reply) return jsonError("Table introuvable.", 400);

  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking || booking.customer_id !== auth.customer.id) return jsonError("Séjour introuvable", 404);
  const stay = booking as CrmBooking;
  const { data: items } = await auth.supabase.from("crm_booking_items").select("*").eq("booking_id", stay.id);
  if (!carnetVisible(stay, (items || []) as CrmBookingItem[])) return jsonError("Séjour introuvable", 404);

  const admin = createServiceClient();
  const evening = await admin
    .from("crm_restaurant_evenings")
    .select("closed_at")
    .eq("booking_id", stay.id)
    .eq("evening_date", date)
    .maybeSingle();
  if (evening.error && !restaurantsReady(evening.error)) {
    return jsonError("Le module restaurants n’est pas encore en place.", 409);
  }
  if ((evening.data as { closed_at?: string | null } | null)?.closed_at) {
    return jsonError("Cette soirée est close.", 409);
  }
  const table = await admin
    .from("crm_restaurant_tables")
    .select("id, status, restaurant_id")
    .eq("booking_id", stay.id)
    .eq("evening_date", date)
    .eq("seat", seat)
    .maybeSingle();
  if (table.error) {
    if (!restaurantsReady(table.error)) return jsonError("Le module restaurants n’est pas encore en place.", 409);
    return jsonError("Table introuvable.", 404);
  }
  const row = table.data as { status?: TableStatus; restaurant_id?: string | null } | null;
  if (!row || row.status !== "proposee") return jsonError("Cette table n’est plus proposée.", 409);

  const saved =
    reply === "accepte"
      ? await saveBookingChoice(admin, stay.id, { date, choice: seat as TableSeat, source: "espace" })
      : await refuseRestaurantSeat(admin, stay.id, { date, seat: seat as TableSeat, source: "espace" });
  if ("error" in saved && saved.error) return jsonError(saved.error, 409);

  let name = "";
  if (row.restaurant_id) {
    const place = await admin.from("crm_restaurants").select("name").eq("id", row.restaurant_id).maybeSingle();
    name = ((place.data as { name?: string } | null)?.name || "").trim();
  }
  const verb = reply === "accepte" ? "accepté" : "refusé";
  await recordCustomerActivity({
    customerId: auth.customer.id,
    authUserId: auth.user.id,
    action: "choix",
    bookingId: stay.id,
    summary: `A ${verb} une table pour le ${formatEveningFr(date)}`.slice(0, 180),
    detail: name || null,
  });
  return NextResponse.json({ ok: true });
}
