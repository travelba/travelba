import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const decision = body?.decision === "decline" ? "decline" : "accept";

  if (decision === "decline") {
    const { data, error } = await auth.supabase.rpc("crm_decline_quote", { p_quote_id: id });
    if (error) return jsonError(error.message, 400);
    return NextResponse.json({ quote: data });
  }

  const name = String(body?.acceptance_name || "").trim();
  const signature = String(body?.signature_data || "").trim();
  if (!name || body?.terms_accepted !== true) return jsonError("Nom et acceptation des CGV requis");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.OTP_RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex");
  const { data, error } = await auth.supabase.rpc("crm_accept_quote", {
    p_quote_id: id,
    p_acceptance_name: name,
    p_terms_accepted: true,
    p_signature_data: signature || null,
    p_ip_hash: ipHash,
  });
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ quote: data });
}
