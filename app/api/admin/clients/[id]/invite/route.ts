import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { appOrigin, inviteCustomer } from "@/lib/crm/invite";
import type { CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return dbError(error, 500);
  if (!data) return jsonError("Client introuvable", 404);

  try {
    const result = await inviteCustomer(data as CrmCustomer, appOrigin(request));
    return NextResponse.json({
      customer: result.customer,
      invited: result.delivered,
      link: result.link,
      notice: result.notice,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invitation impossible";
    return jsonError(message, 502);
  }
}
