import { NextResponse } from "next/server";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { LedgerVoidError, voidManualLedgerMovement } from "@/lib/crm/ledger-void";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = await assertStaffPermission(auth.staff, "edit_finances");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { confirmer?: unknown } | null;
  if (body?.confirmer !== true) return jsonError("Confirmez l’annulation.", 400);
  const { id } = await ctx.params;
  try {
    const result = await voidManualLedgerMovement(createServiceClient(), id, auth.staff.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LedgerVoidError) return jsonError(err.message, 400);
    return jsonError("Annulation impossible.", 500);
  }
}
