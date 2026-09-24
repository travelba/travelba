import { NextResponse } from "next/server";
import { jsonError, jsonIssues, requireCustomer } from "@/lib/crm/auth";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { carnetVisible } from "@/lib/crm/carnet";
import {
  cancelBookingExtra,
  createBookingExtra,
  declineBookingService,
  parseExtraRequest,
} from "@/lib/crm/extras-write";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const body = await request.json().catch(() => null);
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const b = booking as CrmBooking;
  const { data: items } = await auth.supabase
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", b.id);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, list)) return jsonError("Séjour introuvable", 404);
  try {
    const extra = parseExtraRequest(body);
    const admin = createServiceClient();
    if (body?.cancel === true) {
      const cancelled = await cancelBookingExtra(admin, {
        booking: b,
        items: list,
        kind: extra.kind,
        leg: extra.leg,
        place: extra.place,
        moment: extra.moment,
      });
      return NextResponse.json(cancelled);
    }
    if (body?.decline === true) {
      const declined = await declineBookingService(admin, {
        booking: b,
        items: list,
        kind: extra.kind,
        leg: extra.leg,
        place: extra.place,
        moment: extra.moment,
      });
      return NextResponse.json(declined);
    }
    const [{ data: travelers }, { data: companions }] = await Promise.all([
      admin.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
      admin.from("crm_travel_companions").select("*").eq("customer_id", auth.customer.id),
    ]);
    const created = await createBookingExtra(admin, {
      booking: b,
      items: list,
      travelers: (travelers || []) as CrmBookingTraveler[],
      holder: auth.customer as CrmCustomer,
      companions: (companions || []) as CrmCompanion[],
      kind: extra.kind,
      leg: extra.leg,
      place: extra.place,
      moment: extra.moment,
      address: extra.address,
      enforceWindow: true,
    });
    return NextResponse.json(created);
  } catch (err) {
    if (err instanceof BookingIssuesError) return jsonIssues(err.issues);
    return jsonError(err instanceof Error ? err.message : "Demande impossible", 400);
  }
}
