import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { MergeCustomersError, mergeCustomers } from "@/lib/crm/merge-customers";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (auth.staff.role !== "admin") return jsonError("Réservé aux administrateurs.", 403);
  const body = (await request.json().catch(() => null)) as {
    doublon_id?: unknown;
    confirmer?: unknown;
    forcer?: unknown;
  } | null;
  const { id } = await ctx.params;
  try {
    const result = await mergeCustomers(createServiceClient(), {
      keepId: id,
      dropId: typeof body?.doublon_id === "string" ? body.doublon_id : "",
      confirmer: body?.confirmer,
      force: body?.forcer === true,
      actor: auth.staff.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MergeCustomersError) return jsonError(err.message, 400);
    return jsonError("Fusion impossible.", 500);
  }
}
