import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";

export const runtime = "nodejs";

const schema = z.object({
  le_hotel_id: z.number().int().positive(),
  hotel_name: z.string().nullable().optional(),
  emails: z.array(z.string().email()).default([]),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const hotelId = new URL(request.url).searchParams.get("le_hotel_id");
  let query = supabase
    .from("agency_hotel_contacts")
    .select("*")
    .eq("user_id", user.id)
    .order("hotel_name");

  if (hotelId) {
    query = query.eq("le_hotel_id", Number(hotelId));
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ contacts: data });
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  const { data, error } = await supabase
    .from("agency_hotel_contacts")
    .upsert(
      {
        user_id: user.id,
        le_hotel_id: parsed.data.le_hotel_id,
        hotel_name: parsed.data.hotel_name ?? null,
        emails: parsed.data.emails,
        phone: parsed.data.phone ?? null,
        notes: parsed.data.notes ?? null,
      },
      { onConflict: "user_id,le_hotel_id" }
    )
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ contact: data });
}
