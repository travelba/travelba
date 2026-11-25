import { NextResponse } from "next/server";
import { loadPermissionMatrix } from "@/lib/crm/agency-guard";
import { roleAllows } from "@/lib/crm/agency-access";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { setReferralReward, SignupError } from "@/lib/crm/signup-run";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const matrix = await loadPermissionMatrix();
  if (!roleAllows(auth.staff.role, "review_signups", matrix)) return jsonError("Réservé aux administrateurs.", 403);
  const body = (await request.json().catch(() => null)) as { id?: string; note?: string } | null;
  if (!body?.id) return jsonError("Parrainage introuvable.", 400);
  try {
    await setReferralReward(body.id, body.note || "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SignupError) return jsonError(error.message, error.status);
    return jsonError("La note n’a pas été enregistrée.", 500);
  }
}
