import { NextResponse } from "next/server";
import { loadPermissionMatrix } from "@/lib/crm/agency-guard";
import { roleAllows } from "@/lib/crm/agency-access";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { appOrigin } from "@/lib/crm/invite";
import { createSignupInvitation, customerForInvitation, SignupError } from "@/lib/crm/signup-run";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const matrix = await loadPermissionMatrix();
  if (!roleAllows(auth.staff.role, "review_signups", matrix)) return jsonError("Réservé aux administrateurs.", 403);
  const body = (await request.json().catch(() => null)) as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    customerId?: string;
    send?: boolean;
    kind?: "admin" | "parrainage";
    referrerCustomerId?: string;
  } | null;
  let firstName = body?.firstName || "";
  let lastName = body?.lastName || "";
  let phone = body?.phone || "";
  let email = body?.email || "";
  let referrerFirstName = "";
  if (body?.kind === "parrainage" && body.referrerCustomerId) {
    const parrain = await customerForInvitation(body.referrerCustomerId);
    if (!parrain) return jsonError("Membre introuvable.", 404);
    referrerFirstName = parrain.first_name;
  }
  if (body?.customerId && body.kind !== "parrainage") {
    const fiche = await customerForInvitation(body.customerId);
    if (!fiche) return jsonError("Fiche introuvable.", 404);
    firstName = firstName || fiche.first_name;
    lastName = lastName || fiche.last_name;
    phone = phone || fiche.phone || "";
    email = email || fiche.email || "";
  }
  try {
    const created = await createSignupInvitation({
      firstName,
      lastName,
      phone,
      email,
      customerId: body?.kind === "parrainage" ? null : body?.customerId || null,
      staffId: auth.staff.id,
      origin: appOrigin(request),
      send: body?.send === true,
      kind: body?.kind === "parrainage" ? "parrainage" : "admin",
      referrerCustomerId: body?.referrerCustomerId || null,
      referrerFirstName,
    });
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof SignupError) return jsonError(error.message, error.status);
    return jsonError("L’invitation n’a pas été créée.", 500);
  }
}
