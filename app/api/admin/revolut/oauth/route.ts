import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { secretEquals } from "@/lib/crm/secret-equals";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { exchangeRevolutAuthCode, revolutClientId } from "@/lib/crm/revolut";

/** Jeton anti-CSRF du parcours OAuth : posé au départ, exigé au retour, effacé ensuite. */
const STATE_COOKIE = "tb_revolut_state";
const STATE_TTL_SECONDS = 10 * 60;
const STATE_RE = /^[0-9a-f]{32}$/;

function stateCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin/revolut/oauth",
    maxAge,
  };
}

function clearState(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, "", stateCookieOptions(0));
  return response;
}

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const denied = url.searchParams.get("error");

  if (denied) {
    // Refus ou annulation côté Revolut (access_denied…) : retour à l’écran, cookie effacé.
    return clearState(NextResponse.redirect(new URL("/admin/revolut?error=oauth", url.origin)));
  }

  if (code) {
    // Retour de Revolut : le state doit être celui posé au départ, sinon rien n’est échangé.
    // Depuis une preview (NEXT_PUBLIC_SITE_URL = prod), le cookie ne suit pas : connecter Revolut depuis la prod.
    const jar = await cookies();
    const expected = jar.get(STATE_COOKIE)?.value || "";
    if (!state || !STATE_RE.test(expected) || !secretEquals(state, expected)) {
      return clearState(jsonError("État OAuth invalide", 400));
    }
    try {
      await exchangeRevolutAuthCode(code);
      return clearState(NextResponse.redirect(new URL("/admin/revolut?connected=1", url.origin)));
    } catch (err) {
      console.error("[revolut/oauth]", err instanceof Error ? err.message : "échange impossible");
      return clearState(NextResponse.redirect(new URL("/admin/revolut?error=oauth", url.origin)));
    }
  }

  const clientId = revolutClientId();
  if (!clientId) return jsonError("REVOLUT_CLIENT_ID manquant", 503);
  const sandbox = process.env.REVOLUT_SANDBOX === "1";
  const authorize = sandbox
    ? "https://sandbox-business.revolut.com/app-confirm"
    : "https://business.revolut.com/app-confirm";
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || url.origin}/api/admin/revolut/oauth`;
  const fresh = randomBytes(16).toString("hex");
  const dest = new URL(authorize);
  dest.searchParams.set("client_id", clientId);
  dest.searchParams.set("redirect_uri", redirectUri);
  dest.searchParams.set("response_type", "code");
  dest.searchParams.set("state", fresh);
  // READ only — READ_SENSITIVE_CARD_DATA force une whitelist IP incompatible avec Vercel.
  dest.searchParams.set("scope", "READ");
  const response = NextResponse.redirect(dest);
  response.cookies.set(STATE_COOKIE, fresh, stateCookieOptions(STATE_TTL_SECONDS));
  return response;
}
