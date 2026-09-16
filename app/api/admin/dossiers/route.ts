import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";

export const runtime = "nodejs";

const roomSchema = z.object({
  adults: z.number().int().min(1),
  children: z
    .array(z.object({ age: z.number().int().min(0).max(17) }))
    .nullable()
    .optional(),
});

const createSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
  destination_text: z.string().min(1),
  location_id: z.number().int().positive().nullable().optional(),
  location_type: z.enum(["hotel", "location", "inspiration"]).nullable().optional(),
  hotel_id: z.number().int().positive().nullable().optional(),
  hotel_name: z.string().nullable().optional(),
  start_date: z.string().min(8),
  end_date: z.string().min(8),
  currency: z.string().default("EUR"),
  rooms: z.array(roomSchema).min(1),
  notes: z.string().nullable().optional(),
});

export async function GET() {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { data, error } = await supabase
    .from("agency_dossiers")
    .select("*, agency_clients(*)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ dossiers: data });
}

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

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  const payload = parsed.data;
  const { data, error } = await supabase
    .from("agency_dossiers")
    .insert({
      user_id: user.id,
      client_id: payload.client_id ?? null,
      title: payload.title || payload.destination_text,
      destination_text: payload.destination_text,
      location_id: payload.location_id ?? null,
      location_type: payload.location_type ?? null,
      hotel_id: payload.hotel_id ?? null,
      hotel_name: payload.hotel_name ?? null,
      start_date: payload.start_date,
      end_date: payload.end_date,
      currency: payload.currency,
      rooms: payload.rooms,
      notes: payload.notes ?? null,
      status: "draft",
    })
    .select("*, agency_clients(*)")
    .single();

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ dossier: data }, { status: 201 });
}
