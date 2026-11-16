import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requestIsSecure, sessionAudienceFromCookies } from "@/lib/crm/client-session-cookie";
import {
  SIGN_OUT_REVOKE_MS,
  accessTokenFromAuthCookies,
  applySignOut,
  parseSignOutFields,
  revokeAuthSession,
  signOutRedirectPath,
} from "@/lib/crm/sign-out";
import { signupCookieWrite } from "@/lib/crm/self-signup";
import { publicSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Déconnexion agence et client. Le cookie part toujours, même si Auth ne répond pas.
 * Le navigateur ouvre ensuite la page de connexion : pas de navigation client,
 * le proxy renverrait `/admin/login` vers `/admin` tant que le cookie est là.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const fields = parseSignOutFields(body && typeof body === "object" ? body : {});
  const jar = await cookies();
  const before = jar.getAll();
  const secure = requestIsSecure({
    forwardedProto: request.headers.get("x-forwarded-proto"),
    protocol: new URL(request.url).protocol,
  });
  const redirect = signOutRedirectPath({
    requested: fields.next,
    audience: sessionAudienceFromCookies(before),
  });

  try {
    const { url, anonKey } = publicSupabaseEnv();
    await revokeAuthSession({
      supabaseUrl: url,
      anonKey,
      accessToken: accessTokenFromAuthCookies(before),
      scope: fields.scope,
      signal: AbortSignal.timeout(SIGN_OUT_REVOKE_MS),
    });
  } catch {
    /* La révocation a échoué ou a trop tardé. Les cookies partent quand même. */
  }

  const response = NextResponse.json({ ok: true, redirect });
  const signup = signupCookieWrite("clear", secure);
  response.cookies.set(signup.name, signup.value, signup.options);
  return applySignOut(response, before, secure);
}
