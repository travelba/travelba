import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  address_line: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  passport_number: z.string().nullable().optional(),
});

export async function GET() {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { data, error } = await supabase
    .from("agency_clients")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ clients: data });
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
    .from("agency_clients")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      whatsapp: parsed.data.whatsapp ?? null,
      notes: parsed.data.notes ?? null,
      address_line: parsed.data.address_line ?? null,
      postal_code: parsed.data.postal_code ?? null,
      city: parsed.data.city ?? null,
      country: parsed.data.country ?? null,
      passport_number: parsed.data.passport_number ?? null,
    })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ client: data }, { status: 201 });
}
