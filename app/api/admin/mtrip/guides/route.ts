import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { ensureQuoteToken, ensureShortCode } from "@/lib/agency/quote-link";
import { passengerSchema } from "@/lib/mtrip/passenger-schema";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().min(2).default("Nouveau voyage"),
  dossier_id: z.string().uuid().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  passengers: z.array(passengerSchema).default([]),
});

export async function GET() {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { data, error } = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ guides: data });
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const raw = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("Validation échouée", 422, parsed.error.flatten());
  }

  const passengers = parsed.data.passengers.map((p, index) => ({
    ...p,
    role: p.role || (index === 0 ? "lead_traveler" : "traveler"),
    language: p.language || "fr",
  }));

  const quote_token = ensureQuoteToken();
  const short_code = ensureShortCode();

  const { data, error } = await supabase
    .from("agency_mtrip_guides")
    .insert({
      user_id: user.id,
      title: parsed.data.title || "Nouveau voyage",
      dossier_id: parsed.data.dossier_id ?? null,
      start_date: parsed.data.start_date || null,
      end_date: parsed.data.end_date || null,
      passengers,
      status: "draft",
      mtrip_account_id: Number(process.env.MTRIP_ACCOUNT_ID || 66582),
      quote_lines: [],
      passport_files: [],
      sends: [],
      quote_token,
      short_code,
    })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ guide: data }, { status: 201 });
}
