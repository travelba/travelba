import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { removeColleague, setColleagueRole, StaffTeamError } from "@/lib/crm/staff-directory";
import { isUuid } from "@/lib/crm/ids";
import { parseStaffRole, STAFF_COPY } from "@/lib/crm/staff-team";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function teamError(err: unknown) {
  if (err instanceof StaffTeamError) return jsonError(err.message, err.status);
  console.error("[equipe] échec");
  return jsonError("Opération impossible. Réessayez.", 500);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(STAFF_COPY.notFound, 404);
  const body = await request.json().catch(() => null);
  const role = parseStaffRole(body?.role);
  if (!role) return jsonError(STAFF_COPY.role);
  try {
    const result = await setColleagueRole(id, role);
    return NextResponse.json({ ok: true, role: result.role });
  } catch (err) {
    return teamError(err);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(STAFF_COPY.notFound, 404);
  try {
    await removeColleague(id, auth.staff.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return teamError(err);
  }
}
