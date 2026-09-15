import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import {
  LittleEmperorsError,
  createHotelBooking,
} from "@/lib/little-emperors/client";

export const runtime = "nodejs";

const schema = z.object({
  dossier_id: z.string().uuid(),
  start_date: z.string().min(8),
  end_date: z.string().min(8),
  session_id: z.string().min(1),
  rate_index: z.string().min(1),
  hotel_id: z.number().int().positive(),
  guest_name: z.string().min(3),
  guest_email: z.string().email(),
  rooms: z
    .array(
      z.object({
        adults: z.number().int().min(1),
        children: z
          .array(z.object({ age: z.number().int().min(0).max(17) }))
          .nullable()
          .optional(),
        guest_name: z.string().optional(),
        guest_email: z.string().email().optional(),
        send_email_to_guest: z.boolean().optional(),
      })
    )
    .min(1),
  eta: z.string().nullable().optional(),
  special_requests: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("Payload invalide");
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  const { dossier_id, ...bookingPayload } = parsed.data;

  const { data: dossier, error: dossierError } = await supabase
    .from("agency_dossiers")
    .select("*")
    .eq("id", dossier_id)
    .eq("user_id", user.id)
    .single();

  if (dossierError || !dossier) {
    return jsonError("Dossier introuvable", 404);
  }

  try {
    const booking = await createHotelBooking(bookingPayload);

    const { data: saved, error: saveError } = await supabase
      .from("agency_bookings")
      .insert({
        dossier_id,
        user_id: user.id,
        le_booking_id: booking.id,
        confirmation_number: booking.confirmation_number ?? null,
        hotel_id: booking.hotel_id ?? bookingPayload.hotel_id,
        hotel_name: booking.hotel_name ?? dossier.hotel_name,
        check_in: booking.check_in ?? bookingPayload.start_date,
        check_out: booking.check_out ?? bookingPayload.end_date,
        total_cost: booking.total_cost ?? null,
        currency: booking.currency ?? dossier.currency,
        state: booking.state ?? "booked",
        guest_name: bookingPayload.guest_name,
        guest_email: bookingPayload.guest_email,
        session_id: bookingPayload.session_id,
        rate_index: bookingPayload.rate_index,
        raw: booking,
      })
      .select("*")
      .single();

    if (saveError) {
      return jsonError(saveError.message, 500);
    }

    await supabase
      .from("agency_dossiers")
      .update({
        status: "payment_pending",
        hotel_id: bookingPayload.hotel_id,
        session_id: bookingPayload.session_id,
        selected_rate_index: bookingPayload.rate_index,
      })
      .eq("id", dossier_id)
      .eq("user_id", user.id);

    return NextResponse.json({ booking: saved, littleEmperors: booking });
  } catch (error) {
    if (error instanceof LittleEmperorsError) {
      return jsonError(error.message, error.status, error.body);
    }
    throw error;
  }
}
