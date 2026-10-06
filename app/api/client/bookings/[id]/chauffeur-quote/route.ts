import { NextResponse } from "next/server";
import { jsonError, jsonIssues, requireCustomer } from "@/lib/crm/auth";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { carnetVisible } from "@/lib/crm/carnet";
import { publicChauffeurQuote, quoteChauffeurOffer } from "@/lib/crm/chauffeur-quote";
import { isExtraLeg, isServicePlace } from "@/lib/crm/extras";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

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
  const { data: items } = await auth.supabase.from("crm_booking_items").select("*").eq("booking_id", b.id);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, list)) return jsonError("Séjour introuvable", 404);
  const leg = String(body?.leg || "");
  const place = String(body?.place || "");
  if (!isExtraLeg(leg) || !isServicePlace(place)) {
    return jsonIssues([{ field: "leg", message: "Indiquez le trajet du transfert." }]);
  }
  try {
    const vehicles = await quoteChauffeurOffer({
      items: list,
      leg,
      place,
      depart: String(body?.depart || ""),
      arrive: String(body?.arrive || ""),
      currency: b.currency || "EUR",
    });
    return NextResponse.json({ vehicles: vehicles.map(publicChauffeurQuote) });
  } catch (error) {
    if (error instanceof BookingIssuesError) return jsonIssues(error.issues);
    return jsonError(error instanceof Error ? error.message : "Devis impossible", 400);
  }
}
