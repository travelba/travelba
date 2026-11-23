import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { hashUnlockToken, nextUnlockExpiry, unlockSessionDecision } from "@/lib/crm/device-unlock";
import { rateLimit, rateLimitKey, requestIp, RATE_LIMITED_MESSAGE } from "@/lib/crm/rate-limit";
import { mustSetPassword } from "@/lib/crm/session";
import { clientAuthCookieOptions, AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const REFUSED = "Le déverrouillage n’a pas abouti. Utilisez votre mot de passe.";

function schemaMissing(code: string | undefined) {
  return code === "42P01" || code === "PGRST205";
}

function finishClientCookies(response: NextResponse) {
  const options = clientAuthCookieOptions(process.env.NODE_ENV === "production");
  for (const cookie of response.cookies.getAll()) {
    if (!cookie.value || !cookie.name.includes("auth-token")) continue;
    response.cookies.set(cookie.name, cookie.value, options);
  }
}

/** Échange le jeton du trousseau contre le cookie de session. Le mot de passe reste le repli. */
export async function POST(request: Request) {
  const allowed = await rateLimit({
    key: rateLimitKey("unlock", requestIp(request.headers)),
    limit: 12,
    windowSeconds: 60 * 60,
  });
  if (!allowed) return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const hash = hashUnlockToken(token);
  if (!hash) return NextResponse.json({ error: REFUSED }, { status: 401 });

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_device_unlocks")
    .select("id, customer_id, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error) {
    if (schemaMissing(error.code)) return NextResponse.json({ error: "Le déverrouillage n’est pas encore ouvert." }, { status: 503 });
    console.error("[unlock]", error.code ?? "?");
    return NextResponse.json({ error: REFUSED }, { status: 401 });
  }
  const row = data as { id: string; customer_id: string; expires_at: string; revoked_at: string | null } | null;
  const customer = row
    ? (
        await admin
          .from("crm_customers")
          .select("id, email, auth_user_id")
          .eq("id", row.customer_id)
          .maybeSingle()
      ).data
    : null;
  const account = customer as { email?: string | null; auth_user_id?: string | null } | null;
  if (
    unlockSessionDecision(
      row
        ? {
            revokedAt: row.revoked_at,
            expiresAt: row.expires_at,
            email: account?.email || null,
            authUserId: account?.auth_user_id || null,
          }
        : null,
      new Date()
    ) !== "ok" ||
    !row ||
    !account?.auth_user_id ||
    !account.email
  ) {
    return NextResponse.json({ error: REFUSED }, { status: 401 });
  }

  const { data: userWrap } = await admin.auth.admin.getUserById(account.auth_user_id);
  const user = userWrap.user;
  if (!user || mustSetPassword(user)) return NextResponse.json({ error: REFUSED }, { status: 401 });
  const { data: staff } = await admin
    .from("crm_staff")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (staff) return NextResponse.json({ error: REFUSED }, { status: 401 });

  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: account.email });
  const hashed = generated.data?.properties?.hashed_token || "";
  if (generated.error || !hashed) return NextResponse.json({ error: REFUSED }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  const { url, anonKey } = publicSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: clientAuthCookieOptions(process.env.NODE_ENV === "production"),
    cookies: {
      getAll() {
        return [];
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...AUTH_COOKIE_OPTIONS, ...options });
        });
      },
    },
  });
  const verified = await supabase.auth.verifyOtp({ token_hash: hashed, type: "magiclink" as EmailOtpType });
  if (verified.error || !verified.data.user) return NextResponse.json({ error: REFUSED }, { status: 401 });
  finishClientCookies(response);
  await admin
    .from("crm_device_unlocks")
    .update({ last_used_at: new Date().toISOString(), expires_at: nextUnlockExpiry(new Date()) })
    .eq("id", row.id);
  return response;
}
