import { NextResponse } from "next/server";
import { loadPermissionMatrix } from "@/lib/crm/agency-guard";
import { roleAllows } from "@/lib/crm/agency-access";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { appOrigin } from "@/lib/crm/invite";
import { reviewSignup, SignupError } from "@/lib/crm/signup-run";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const matrix = await loadPermissionMatrix();
  if (!roleAllows(auth.staff.role, "review_signups", matrix)) return jsonError("Réservé aux administrateurs.", 403);
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    mode?: "rattacher" | "creer";
    customerId?: string;
    reason?: string;
    notify?: boolean;
    message?: string;
  } | null;
  const action = body?.action;
  if (action !== "valider" && action !== "refuser" && action !== "completer") {
    return jsonError("Action inconnue.", 400);
  }
  try {
    const result = await reviewSignup({
      id,
      action,
      mode: body?.mode,
      customerId: body?.customerId,
      reason: body?.reason,
      notify: body?.notify,
      message: body?.message,
      staffId: auth.staff.id,
      origin: appOrigin(request),
    });
    return NextResponse.json({ ok: true, clientId: result.customerId, avertissement: result.inviteWarning || null });
  } catch (error) {
    if (error instanceof SignupError) return jsonError(error.message, error.status);
    return jsonError("La demande n’a pas pu être traitée.", 500);
  }
}
