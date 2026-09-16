import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (auth.staff.role !== "admin" && auth.staff.permissions?.finance !== true) return jsonError("Permission finance requise", 403);
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const status = String(body?.status || "");
  if (!["pending", "posted", "void"].includes(status)) return jsonError("Statut invalide");
  const { data, error } = await auth.supabase.rpc("crm_set_transaction_status", { p_transaction_id: id, p_status: status });
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ transaction: data });
}
