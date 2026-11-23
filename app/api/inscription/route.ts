import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/crm/invite";
import { honeypotTripped, validateSignupDraft } from "@/lib/crm/signup";
import { SIGNUP_COOKIE, signupCookieOptions } from "@/lib/crm/signup-cookie";
import { clientIp, SignupError, submitSignup } from "@/lib/crm/signup-run";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (honeypotTripped(body?.company_website)) {
    return NextResponse.json({ ok: true, suite: "email" });
  }
  const parsed = validateSignupDraft(body || {});
  if (!parsed.ok) return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });
  try {
    const result = await submitSignup({
      draft: parsed.value,
      origin: appOrigin(request),
      invitationToken: typeof body?.invitationToken === "string" ? body.invitationToken : null,
      ip: clientIp(request.headers),
    });
    const response = NextResponse.json({ ok: true, suite: "email" });
    if (result.viewToken) response.cookies.set(SIGNUP_COOKIE, result.viewToken, signupCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof SignupError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    console.error("[inscription] dépôt");
    return NextResponse.json({ ok: false, error: "La demande n’a pas pu être envoyée." }, { status: 500 });
  }
}
