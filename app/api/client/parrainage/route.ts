import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { appOrigin } from "@/lib/crm/invite";
import { createSignupInvitation, referralAccountFor, SignupError } from "@/lib/crm/signup-run";
import { referralShareText, expiresLabel, INVITATION_TTL_MS } from "@/lib/crm/signup";

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { firstName?: string; phone?: string; confirmer?: boolean } | null;
  const firstName = (body?.firstName || "").trim();
  const phone = (body?.phone || "").trim();
  if (firstName.length < 1 || phone.length < 5) return jsonError("Indiquez le prénom et le téléphone.", 400);
  const balance = await referralAccountFor(auth.customer.id);
  if (balance?.blocked) return jsonError("Le plafond de 10 invitations est atteint.", 409);
  if (body?.confirmer !== true) {
    const when = expiresLabel(new Date(Date.now() + INVITATION_TTL_MS));
    return NextResponse.json({
      apercu: true,
      message: referralShareText({
        guestFirstName: firstName,
        referrerFirstName: auth.customer.first_name,
        link: "lien personnel",
        expiresLabel: when,
      }),
      restantes: balance?.remaining ?? null,
    });
  }
  try {
    const created = await createSignupInvitation({
      firstName,
      phone,
      origin: appOrigin(request),
      send: true,
      kind: "parrainage",
      referrerCustomerId: auth.customer.id,
      referrerFirstName: auth.customer.first_name,
    });
    return NextResponse.json({ ...created, apercu: false });
  } catch (error) {
    if (error instanceof SignupError) return jsonError(error.message, error.status);
    return jsonError("L’invitation n’a pas pu être envoyée.", 500);
  }
}
