import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { saveVisaUploads } from "@/lib/crm/visa-save";
import type { VisaCorridor } from "@/lib/crm/visa-fees";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data: booking } = await auth.supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  const b = booking as CrmBooking;
  const [{ data: items }, { data: travelers }] = await Promise.all([
    auth.supabase.from("crm_booking_items").select("*").eq("booking_id", b.id),
    auth.supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
  ]);
  const party = (travelers || []) as CrmBookingTraveler[];
  const trip = frenchPassportTrip((items || []) as CrmBookingItem[], party.length);
  if (!trip.needsFormality) return jsonError("Aucune formalité de visa sur ce séjour.");
  const form = await request.formData();
  const files = form.getAll("file").filter((value): value is File => value instanceof File);
  try {
    const result = await saveVisaUploads(auth.supabase, {
      customerId: b.customer_id,
      bookingId: b.id,
      travelers: party,
      countries: trip.entries.map((entry) => ({ iso: entry.iso, name: entry.name })),
      files,
    });
    if (result.saved > 0) {
      const { data: open } = await auth.supabase
        .from("crm_visa_requests")
        .select("country")
        .eq("booking_id", b.id)
        .eq("status", "en_cours");
      for (const row of (open || []) as { country: VisaCorridor }[]) {
        await auth.supabase
          .from("crm_visa_requests")
          .update({ status: "piece" })
          .eq("booking_id", b.id)
          .eq("country", row.country);
        for (const traveler of party) {
          const name = `${traveler.first_name} ${traveler.last_name}`.trim();
          await auth.supabase.from("crm_visa_notices").upsert(
            {
              booking_id: b.id,
              traveler_key: traveler.id,
              kind: "piece",
              country: row.country,
              holder_name: name,
            },
            { onConflict: "booking_id,traveler_key,kind,country" }
          );
        }
      }
    }
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Envoi impossible", 400);
  }
}
