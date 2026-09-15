import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { DOSSIER_STATUSES } from "@/lib/agency/types";

export const runtime = "nodejs";

const updateSchema = z.object({
  status: z.enum(DOSSIER_STATUSES).optional(),
  client_id: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
  destination_text: z.string().optional(),
  location_id: z.number().int().positive().nullable().optional(),
  location_type: z.enum(["hotel", "location", "inspiration"]).nullable().optional(),
  hotel_id: z.number().int().positive().nullable().optional(),
  hotel_name: z.string().nullable().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  currency: z.string().optional(),
  rooms: z
    .array(
      z.object({
        adults: z.number().int().min(1),
        children: z
          .array(z.object({ age: z.number().int().min(0).max(17) }))
          .nullable()
          .optional(),
      })
    )
    .optional(),
  selected_rate_index: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await context.params;

  const { data: dossier, error } = await supabase
    .from("agency_dossiers")
    .select("*, agency_clients(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !dossier) return jsonError("Dossier introuvable", 404);

  const [hotels, quotes, bookings, followups] = await Promise.all([
    supabase
      .from("agency_dossier_hotels")
      .select("*")
      .eq("dossier_id", id)
      .eq("user_id", user.id)
      .order("lowest_rate", { ascending: true }),
    supabase
      .from("agency_quotes")
      .select("*")
      .eq("dossier_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agency_bookings")
      .select("*")
      .eq("dossier_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agency_payment_followups")
      .select("*")
      .eq("dossier_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    dossier,
    hotels: hotels.data || [],
    quotes: quotes.data || [],
    bookings: bookings.data || [],
    followups: followups.data || [],
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("Payload invalide");
  }

  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  const { data, error } = await supabase
    .from("agency_dossiers")
    .update(parsed.data)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*, agency_clients(*)")
    .single();

  if (error || !data) return jsonError(error?.message || "Mise à jour impossible", 500);
  return NextResponse.json({ dossier: data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await context.params;

  const { error } = await supabase
    .from("agency_dossiers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
