import { NextResponse } from "next/server";
import { jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { createBookingExtra, parseExtraRequest } from "@/lib/crm/extras-write";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  try {
    const extra = parseExtraRequest(body);
    const [{ data: items }, { data: travelers }, { data: holder }, { data: companions }] =
      await Promise.all([
        auth.supabase.from("crm_booking_items").select("*").eq("booking_id", id),
        auth.supabase.from("crm_booking_travelers").select("*").eq("booking_id", id),
        auth.supabase.from("crm_customers").select("*").eq("id", booking.customer_id).maybeSingle(),
        auth.supabase.from("crm_travel_companions").select("*").eq("customer_id", booking.customer_id),
      ]);
    if (!holder) return jsonIssues([{ field: "customer_id", message: "Client introuvable." }], 404);
    const created = await createBookingExtra(auth.supabase, {
      booking: booking as CrmBooking,
      items: (items || []) as CrmBookingItem[],
      travelers: (travelers || []) as CrmBookingTraveler[],
      holder: holder as CrmCustomer,
      companions: (companions || []) as CrmCompanion[],
      kind: extra.kind,
      leg: extra.leg,
      place: extra.place,
      moment: extra.moment,
      address: extra.address,
      enforceWindow: false,
    });
    return NextResponse.json(created);
  } catch (err) {
    if (err instanceof BookingIssuesError) return jsonIssues(err.issues);
    return jsonError(err instanceof Error ? err.message : "Service impossible", 400);
  }
}
