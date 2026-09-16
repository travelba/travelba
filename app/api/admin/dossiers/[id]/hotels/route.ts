import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import {
  LittleEmperorsError,
  getHotelAvailability,
} from "@/lib/little-emperors/client";

export const runtime = "nodejs";

const saveSchema = z.object({
  hotels: z.array(
    z.object({
      le_hotel_id: z.number().int().positive(),
      hotel_name: z.string(),
      location: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
      lowest_rate: z.number().nullable().optional(),
      currency_code: z.string().nullable().optional(),
      is_available: z.boolean().optional(),
      is_selected: z.boolean().optional(),
      snapshot: z.unknown().optional(),
    })
  ),
  replace: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await context.params;

  const { data: dossier, error: dossierError } = await supabase
    .from("agency_dossiers")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (dossierError || !dossier) return jsonError("Dossier introuvable", 404);

  // If body empty / action=search — run LE availability from dossier fields
  let json: Record<string, unknown> = {};
  try {
    json = (await request.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }

  if (json.action === "search" || Object.keys(json).length === 0) {
    if (!dossier.location_id && !dossier.hotel_id) {
      return jsonError("Destination ou hôtel manquant sur le dossier");
    }

    const locationType = dossier.location_type as string | null;
    try {
      const hotels = await getHotelAvailability({
        start_date: dossier.start_date,
        end_date: dossier.end_date,
        currency: dossier.currency || "EUR",
        rooms: dossier.rooms,
        hotel_id: dossier.hotel_id || null,
        location_id:
          !dossier.hotel_id && locationType !== "inspiration"
            ? dossier.location_id
            : null,
        inspiration_id:
          !dossier.hotel_id && locationType === "inspiration"
            ? dossier.location_id
            : null,
      });

      await supabase
        .from("agency_dossier_hotels")
        .delete()
        .eq("dossier_id", id)
        .eq("user_id", user.id);

      const rows = hotels.map((hotel) => ({
        dossier_id: id,
        user_id: user.id,
        le_hotel_id: hotel.hotel_id,
        hotel_name: hotel.hotel_name,
        location: hotel.hotel_info?.location || null,
        image_url:
          hotel.hotel_info?.images?.[0]?.thumbnail_url ||
          hotel.hotel_info?.images?.[0]?.url ||
          null,
        lowest_rate:
          hotel.lowest_rate?.total_to_book_in_requested_currency ??
          hotel.lowest_rate?.rate_in_requested_currency ??
          hotel.lowest_rate?.total_to_book ??
          null,
        currency_code:
          hotel.lowest_rate?.requested_currency_code ||
          hotel.lowest_rate?.currency_code ||
          dossier.currency,
        is_available: hotel.is_available,
        is_selected: false,
        snapshot: hotel,
      }));

      if (rows.length) {
        const { error: insertError } = await supabase
          .from("agency_dossier_hotels")
          .insert(rows);
        if (insertError) return jsonError(insertError.message, 500);
      }

      const { data } = await supabase
        .from("agency_dossier_hotels")
        .select("*")
        .eq("dossier_id", id)
        .eq("user_id", user.id)
        .order("lowest_rate", { ascending: true });

      return NextResponse.json({ hotels: data || [], raw: hotels });
    } catch (error) {
      if (error instanceof LittleEmperorsError) {
        return jsonError(error.message, error.status, error.body);
      }
      throw error;
    }
  }

  const parsed = saveSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  if (parsed.data.replace !== false) {
    await supabase
      .from("agency_dossier_hotels")
      .delete()
      .eq("dossier_id", id)
      .eq("user_id", user.id);
  }

  const rows = parsed.data.hotels.map((hotel) => ({
    dossier_id: id,
    user_id: user.id,
    ...hotel,
    is_available: hotel.is_available ?? true,
    is_selected: hotel.is_selected ?? false,
  }));

  const { data, error } = await supabase
    .from("agency_dossier_hotels")
    .insert(rows)
    .select("*");

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ hotels: data });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await context.params;

  const body = z
    .object({
      le_hotel_id: z.number().int().positive(),
      is_selected: z.boolean(),
      exclusive: z.boolean().optional(),
    })
    .safeParse(await request.json().catch(() => null));

  if (!body.success) return jsonError("Validation échouée", 422, body.error.flatten());

  if (body.data.exclusive && body.data.is_selected) {
    await supabase
      .from("agency_dossier_hotels")
      .update({ is_selected: false })
      .eq("dossier_id", id)
      .eq("user_id", user.id);
  }

  const { data, error } = await supabase
    .from("agency_dossier_hotels")
    .update({ is_selected: body.data.is_selected })
    .eq("dossier_id", id)
    .eq("user_id", user.id)
    .eq("le_hotel_id", body.data.le_hotel_id)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);

  if (body.data.is_selected) {
    await supabase
      .from("agency_dossiers")
      .update({
        hotel_id: body.data.le_hotel_id,
        hotel_name: data.hotel_name,
        status: "hotel_selected",
      })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ hotel: data });
}
