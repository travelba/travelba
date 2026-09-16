import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { resolveCountryCode } from "@/lib/crm/countries";
import { emptyToNull } from "@/lib/crm/identity";
import { toE164 } from "@/lib/crm/phone";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Client introuvable", 404);
  return NextResponse.json({ customer: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const key of [
    "first_name",
    "last_name",
    "email",
    "phone",
    "whatsapp",
    "birth_date",
    "sex",
    "nationality",
    "address_line",
    "postal_code",
    "city",
    "country",
  ]) {
    if (key in body) {
      if (key === "email") {
        patch[key] = String(body[key] || "").trim().toLowerCase();
      } else if (key === "phone" || key === "whatsapp") {
        const raw = emptyToNull(body[key]);
        patch[key] = raw ? toE164(raw, "FR") || raw : null;
      } else if (key === "nationality" || key === "country") {
        patch[key] = resolveCountryCode(String(body[key] || "")) || emptyToNull(body[key]);
      } else {
        patch[key] = emptyToNull(body[key]);
      }
    }
  }
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ customer: data });
}
