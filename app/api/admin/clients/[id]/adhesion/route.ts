import { NextResponse } from "next/server";
import { loadPermissionMatrix } from "@/lib/crm/agency-guard";
import { roleAllows } from "@/lib/crm/agency-access";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { renewClubMembership, SignupError } from "@/lib/crm/signup-run";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const matrix = await loadPermissionMatrix();
  if (!roleAllows(auth.staff.role, "review_signups", matrix)) return jsonError("Réservé aux administrateurs.", 403);
  const { id } = await context.params;
  try {
    const renewed = await renewClubMembership(id);
    return NextResponse.json({ ok: true, fin: renewed.endsOn });
  } catch (error) {
    if (error instanceof SignupError) return jsonError(error.message, error.status);
    return jsonError("Le renouvellement n’a pas été enregistré.", 500);
  }
}
