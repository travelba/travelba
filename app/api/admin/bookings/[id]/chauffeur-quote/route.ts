import { NextResponse } from "next/server";
import { jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { publicChauffeurQuote, quoteChauffeurOffer } from "@/lib/crm/chauffeur-quote";
import { isExtraLeg, isServicePlace } from "@/lib/crm/extras";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const { data: booking } = await auth.supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  const leg = String(body?.leg || "");
  const place = String(body?.place || "");
  if (!isExtraLeg(leg) || !isServicePlace(place)) {
    return jsonIssues([{ field: "leg", message: "Indiquez le trajet du transfert." }]);
  }
  const { data: items } = await auth.supabase.from("crm_booking_items").select("*").eq("booking_id", id);
  try {
    const vehicles = await quoteChauffeurOffer({
      items: (items || []) as CrmBookingItem[],
      leg,
      place,
      depart: String(body?.depart || ""),
      arrive: String(body?.arrive || ""),
      currency: (booking as CrmBooking).currency || "EUR",
    });
    return NextResponse.json({ vehicles: vehicles.map(publicChauffeurQuote) });
  } catch (error) {
    if (error instanceof BookingIssuesError) return jsonIssues(error.issues);
    return jsonError(error instanceof Error ? error.message : "Devis impossible", 400);
  }
}
