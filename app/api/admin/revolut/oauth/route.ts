import { NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { exchangeRevolutAuthCode } from "@/lib/crm/revolut";

const STATE_COOKIE = "travelba_revolut_oauth_state";

function statesMatch(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const cookieStore = await cookies();
    const state = url.searchParams.get("state");
    const expectedState = cookieStore.get(STATE_COOKIE)?.value;
    cookieStore.delete(STATE_COOKIE);
    if (!statesMatch(state, expectedState)) {
      return jsonError("Session OAuth Revolut invalide ou expirée.", 400);
    }
    try {
      await exchangeRevolutAuthCode(code);
      return NextResponse.redirect(new URL("/admin/revolut?connected=1", url.origin));
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "OAuth Revolut", 400);
    }
  }

  const clientId = process.env.REVOLUT_CLIENT_ID;
  if (!clientId) return jsonError("REVOLUT_CLIENT_ID manquant", 503);
  const sandbox = process.env.REVOLUT_SANDBOX === "1";
  const authorize = sandbox
    ? "https://sandbox-business.revolut.com/app-confirm"
    : "https://business.revolut.com/app-confirm";
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || url.origin}/api/admin/revolut/oauth`;
  const state = randomBytes(32).toString("base64url");
  const dest = new URL(authorize);
  dest.searchParams.set("client_id", clientId);
  dest.searchParams.set("redirect_uri", redirectUri);
  dest.searchParams.set("response_type", "code");
  dest.searchParams.set("state", state);
  const response = NextResponse.redirect(dest);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/admin/revolut/oauth",
  });
  return response;
}
