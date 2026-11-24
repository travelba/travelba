import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/crm/invite";
import { SIGNUP_COOKIE, signupCookieOptions } from "@/lib/crm/signup-cookie";
import { readSignupStatus } from "@/lib/crm/signup-run";

/** Pose le cookie de suivi, puis retire le jeton de l’adresse. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") || "";
  const origin = appOrigin(request);
  const target = new URL("/inscription/attente", origin);
  if (!token) return NextResponse.redirect(target);
  const status = await readSignupStatus(token);
  const response = NextResponse.redirect(target);
  if (status) response.cookies.set(SIGNUP_COOKIE, token, signupCookieOptions());
  return response;
}
