import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { sessionIdFromAccessToken } from "@/lib/crm/agency-access";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { jsonError } from "@/lib/crm/auth";
import { isAuthSessionCookieName, requestIsSecure, stampClientSession } from "@/lib/crm/client-session-cookie";
import { recordCustomerLogin } from "@/lib/crm/customer-login";
import { LOGIN_FAILURE_MESSAGE } from "@/lib/crm/login-message";
import { PASSWORD_SETUP_COOKIE, needsClientOnboarding, withoutMustSetPassword } from "@/lib/crm/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { AUTH_COOKIE_MAX_AGE, AUTH_COOKIE_OPTIONS, clientAuthCookieOptions } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

type PendingCookie = { name: string; value: string; maxAge: number };

/**
 * Connexion client par mot de passe. Le cookie part dans Set-Cookie (date Expires,
 * Max-Age, HttpOnly, Secure), pas via document.cookie : Safari iOS jette ce dernier
 * en quittant l’app ou l’icône de l’écran d’accueil.
 * L’agence qui passe par /admin/login n’utilise pas cette route.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim();
  const password = String(body?.password || "");
  if (!email || !password) return jsonError(LOGIN_FAILURE_MESSAGE, 401);

  const secure = requestIsSecure({
    forwardedProto: request.headers.get("x-forwarded-proto"),
    protocol: new URL(request.url).protocol,
  });
  const jar = await cookies();
  const pending: PendingCookie[] = [];
  const { url, anonKey } = publicSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: clientAuthCookieOptions(secure),
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          const maxAge = cookie.options.maxAge === 0 ? 0 : AUTH_COOKIE_MAX_AGE;
          pending.push({ name: cookie.name, value: maxAge === 0 ? "" : cookie.value, maxAge });
          try {
            jar.set(cookie.name, maxAge === 0 ? "" : cookie.value);
          } catch {
            /* La réponse porte les cookies. Le bac de la requête peut refuser l’écriture. */
          }
        }
      },
    },
  });

  const signed = await supabase.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.user) return jsonError(LOGIN_FAILURE_MESSAGE, 401);
  const user = signed.data.user;

  const staff = await readActiveStaff(user.id);
  if (staff && staff.active === false) return jsonError("Cet accès est désactivé.", 403);
  if (staff) {
    const sessionId = sessionIdFromAccessToken(signed.data.session?.access_token);
    if (sessionId) {
      try {
        const admin = createServiceClient({ allowPreview: true });
        await admin.from("crm_staff_sessions").upsert(
          { staff_id: staff.id, session_id: sessionId, last_seen_at: new Date().toISOString(), user_agent: null },
          { onConflict: "staff_id,session_id" },
        );
      } catch {
        /* Table absente : la connexion continue. */
      }
    }
    await recordAgencyJournal({
      staffId: staff.id,
      action: "login",
      entityType: "session",
      summary: "Connexion à l’espace agence.",
      path: "/api/auth/login",
    });
  }

  if (user.app_metadata?.must_set_password === true) {
    try {
      const admin = createServiceClient();
      const { data: fresh } = await admin.auth.admin.getUserById(user.id);
      const meta = withoutMustSetPassword(fresh.user?.app_metadata || user.app_metadata || {});
      const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: meta });
      if (error) return jsonError("Connexion impossible", 500);
      await supabase.auth.refreshSession();
    } catch {
      return jsonError("Connexion impossible", 500);
    }
  }

  await recordCustomerLogin(user.id, "password");

  const response = NextResponse.json({
    ok: true,
    staff: Boolean(staff),
    needsOnboarding: !staff && needsClientOnboarding(user),
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(PASSWORD_SETUP_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure,
    maxAge: 0,
    expires: new Date(0),
  });
  const latest = new Map<string, PendingCookie>();
  for (const cookie of pending) latest.set(cookie.name, cookie);
  for (const cookie of latest.values()) {
    response.cookies.set(cookie.name, cookie.value, writeOptions(cookie, secure, Boolean(staff)));
  }
  if (!staff) {
    stampClientSession(
      response,
      [...latest.values()].filter((cookie) => cookie.value).map((cookie) => ({ name: cookie.name, value: cookie.value })),
      secure,
    );
  }
  return response;
}

function writeOptions(cookie: PendingCookie, secure: boolean, staff: boolean) {
  if (cookie.maxAge === 0) {
    return { ...clientAuthCookieOptions(secure), maxAge: 0, expires: new Date(0) };
  }
  if (staff && isAuthSessionCookieName(cookie.name)) {
    return {
      ...AUTH_COOKIE_OPTIONS,
      expires: new Date(Date.now() + AUTH_COOKIE_MAX_AGE * 1000),
    };
  }
  if (staff) return { ...AUTH_COOKIE_OPTIONS, maxAge: cookie.maxAge };
  return clientAuthCookieOptions(secure);
}

async function readActiveStaff(userId: string): Promise<{ id: string; active: boolean } | null> {
  try {
    const admin = createServiceClient({ allowPreview: true });
    const first = await admin.from("crm_staff").select("id, active").eq("auth_user_id", userId).maybeSingle();
    if (!first.error && first.data) {
      const row = first.data as { id: string; active?: boolean };
      return { id: row.id, active: row.active !== false };
    }
    const second = await admin.from("crm_staff").select("id").eq("auth_user_id", userId).maybeSingle();
    if (second.error || !second.data) return null;
    return { id: (second.data as { id: string }).id, active: true };
  } catch {
    return null;
  }
}
