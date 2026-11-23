import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/crm/invite";
import { SIGNUP_COOKIE, signupCookieOptions } from "@/lib/crm/signup-cookie";
import { SignupError, verifySignupEmail } from "@/lib/crm/signup-run";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") || "";
  const origin = appOrigin(request);
  try {
    const result = await verifySignupEmail(token, origin);
    const response = NextResponse.redirect(new URL("/inscription/attente", origin));
    response.cookies.set(SIGNUP_COOKIE, result.viewToken, signupCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof SignupError ? error.message : "Ce lien n’est pas valable.";
    const response = NextResponse.redirect(new URL(`/inscription/attente?message=${encodeURIComponent(message)}`, origin));
    return response;
  }
}
