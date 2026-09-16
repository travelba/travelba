import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (auth.staff.role !== "admin" && auth.staff.permissions?.finance !== true) {
    return jsonError("Permission finance requise", 403);
  }
  const admin = createServiceClient();
  const action = ["match", "unmatch", "ignore"].includes(body?.action) ? body.action : "match";
  const customerId = body?.customer_id ? String(body.customer_id) : null;
  const { data, error } = await admin.rpc("crm_reconcile_revolut", {
    p_inbox_id: id,
    p_action: action,
    p_customer_id: customerId,
    p_actor_user_id: auth.user.id,
    p_actor_staff_id: auth.staff.id,
  });
  if (error) return jsonError(error.message, error.code === "P0002" ? 404 : 400);
  return NextResponse.json({ row: data });
}
