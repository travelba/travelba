import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { carnetVisible } from "@/lib/crm/carnet";
import { saveVisaUploads } from "@/lib/crm/visa-save";
import { markPaidVisasFiled } from "@/lib/crm/visa-post";
import { createServiceClient } from "@/lib/supabase/admin";
import { notifyFormalitiesReady, safeConcierge } from "@/lib/crm/concierge-send";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const b = booking as CrmBooking;
  const [{ data: items }, { data: travelers }] = await Promise.all([
    auth.supabase.from("crm_booking_items").select("*").eq("booking_id", b.id),
    auth.supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
  ]);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, list)) return jsonError("Séjour introuvable", 404);
  const party = (travelers || []) as CrmBookingTraveler[];
  const trip = frenchPassportTrip(list, party.length);
  if (!trip.needsFormality) return jsonError("Aucune formalité de visa sur ce séjour.");
  const form = await request.formData();
  const files = form.getAll("file").filter((value): value is File => value instanceof File);
  try {
    const result = await saveVisaUploads(auth.supabase, {
      customerId: auth.customer.id,
      bookingId: b.id,
      travelers: party,
      countries: trip.entries.map((entry) => ({ iso: entry.iso, name: entry.name })),
      files,
    });
    if (result.saved > 0) {
      await markPaidVisasFiled(createServiceClient(), b.id, result.countries, party);
      await safeConcierge(() => notifyFormalitiesReady(b.id, result.countries));
    }
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Envoi impossible", 400);
  }
}
