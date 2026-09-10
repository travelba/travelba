import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { buildHotelsQuotePdf, buildRoomsQuotePdf } from "@/lib/agency/pdf";
import {
  LittleEmperorsError,
  getHotelAvailability,
} from "@/lib/little-emperors/client";

export const runtime = "nodejs";

const schema = z.object({
  quote_type: z.enum(["hotels", "rooms"]),
  hotel_ids: z.array(z.number().int().positive()).optional(),
  mark_sent: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await context.params;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  const { data: dossier, error } = await supabase
    .from("agency_dossiers")
    .select("*, agency_clients(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !dossier) return jsonError("Dossier introuvable", 404);

  const clientName = dossier.agency_clients?.name || null;
  let pdf: Buffer;
  let payload: unknown;
  let nextStatus: string | null = null;

  if (parsed.data.quote_type === "hotels") {
    const { data: hotels } = await supabase
      .from("agency_dossier_hotels")
      .select("*")
      .eq("dossier_id", id)
      .eq("user_id", user.id)
      .order("lowest_rate", { ascending: true });

    let selected = hotels || [];
    if (parsed.data.hotel_ids?.length) {
      selected = selected.filter((h) =>
        parsed.data.hotel_ids!.includes(h.le_hotel_id)
      );
    } else {
      const picked = selected.filter((h) => h.is_selected);
      if (picked.length) selected = picked;
    }

    if (!selected.length) {
      return jsonError("Aucun hôtel à inclure dans le devis");
    }

    payload = {
      clientName,
      destination: dossier.destination_text,
      startDate: dossier.start_date,
      endDate: dossier.end_date,
      rooms: dossier.rooms,
      currency: dossier.currency,
      hotels: selected.map((h) => ({
        name: h.hotel_name,
        location: h.location,
        fromPrice: h.lowest_rate,
        currency: h.currency_code,
      })),
    };

    pdf = buildHotelsQuotePdf(payload as Parameters<typeof buildHotelsQuotePdf>[0]);
    nextStatus = "quote_hotels_sent";
  } else {
    if (!dossier.hotel_id) {
      return jsonError("Sélectionnez un hôtel avant le devis chambres");
    }

    try {
      const availability = await getHotelAvailability({
        start_date: dossier.start_date,
        end_date: dossier.end_date,
        currency: dossier.currency || "EUR",
        rooms: dossier.rooms,
        hotel_id: dossier.hotel_id,
      });

      const hotel = availability[0];
      if (!hotel) return jsonError("Pas de disponibilité pour cet hôtel", 404);

      await supabase
        .from("agency_dossiers")
        .update({ session_id: hotel.session_id || null })
        .eq("id", id)
        .eq("user_id", user.id);

      payload = {
        clientName,
        hotelName: hotel.hotel_name || dossier.hotel_name,
        location: hotel.hotel_info?.location || null,
        startDate: dossier.start_date,
        endDate: dossier.end_date,
        rooms: dossier.rooms,
        currency: dossier.currency,
        sessionId: hotel.session_id,
        roomTypes: (hotel.room_types || []).map((room) => ({
          name: room.name,
          description: room.description,
          rates: (room.rates || []).map((rate) => ({
            title: rate.title,
            total:
              rate.total_to_book_in_requested_currency ??
              rate.total_to_book ??
              rate.rate_in_requested_currency,
            currency: rate.requested_currency_code || rate.currency_code,
            cancellation: rate.cancellation_policy,
            benefits: rate.benefits,
            rate_index: rate.rate_index,
          })),
        })),
      };

      pdf = buildRoomsQuotePdf(payload as Parameters<typeof buildRoomsQuotePdf>[0]);
      nextStatus = "quote_rooms_sent";
    } catch (err) {
      if (err instanceof LittleEmperorsError) {
        return jsonError(err.message, err.status, err.body);
      }
      throw err;
    }
  }

  const storagePath = `${user.id}/${id}/${parsed.data.quote_type}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("agency-quotes")
    .upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) return jsonError(uploadError.message, 500);

  const { data: signed } = await supabase.storage
    .from("agency-quotes")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  const { data: quote, error: quoteError } = await supabase
    .from("agency_quotes")
    .insert({
      dossier_id: id,
      user_id: user.id,
      quote_type: parsed.data.quote_type,
      storage_path: storagePath,
      public_url: signed?.signedUrl || null,
      payload,
      sent_at: parsed.data.mark_sent ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (quoteError) return jsonError(quoteError.message, 500);

  if (parsed.data.mark_sent && nextStatus) {
    await supabase
      .from("agency_dossiers")
      .update({ status: nextStatus })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ quote });
}
