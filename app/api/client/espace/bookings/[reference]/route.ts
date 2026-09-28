import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { loadEspaceBooking } from "@/lib/crm/espace-load";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ reference: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { reference } = await ctx.params;
  const detail = await loadEspaceBooking(auth.supabase, auth.customer, reference);
  if (!detail) return jsonError("Introuvable", 404);
  return NextResponse.json(detail, { headers: { "Cache-Control": "private, no-store" } });
}
