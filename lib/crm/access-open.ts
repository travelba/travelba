import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { ensureCustomerForUser, getStaffForUser } from "@/lib/crm/auth";
import { isStaffAccount } from "@/lib/crm/desk-open";
import { entryRequestOrigin, hasAuthSessionCookie, isPreviewBot } from "@/lib/crm/entry-link";
import { loginMethodFromCallback, recordCustomerLogin } from "@/lib/crm/customer-login";
import {
  needsClientOnboarding,
  PASSWORD_SETUP_COOKIE,
  SET_PASSWORD_PATH,
  mustSetPassword,
  signedInClientDestination,
} from "@/lib/crm/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { AUTH_COOKIE_OPTIONS, clientAuthCookieOptions } from "@/lib/supabase/cookie-options";
import { siteConfig } from "@/lib/site";
import {
  accessBusyMarkup,
  accessDeadMarkup,
  accessLinkGate,
  accessNextPath,
  accessOtpType,
  accessPreviewMarkup,
  accessRowAlive,
  hashAccessToken,
  isAccessToken,
} from "./access-resend";

const HTML = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" };

function html(body: string, status = 200) {
  return new NextResponse(body, { status, headers: HTML });
}

function originOf(request: Request) {
  const fallback = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
  return entryRequestOrigin(request, fallback);
}

async function cookieClient(response: NextResponse) {
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();
  return createServerClient(url, anonKey, {
    cookieOptions: clientAuthCookieOptions(process.env.NODE_ENV === "production"),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...AUTH_COOKIE_OPTIONS, ...options });
        });
      },
    },
  });
}

function finishClientCookies(response: NextResponse) {
  const options = clientAuthCookieOptions(process.env.NODE_ENV === "production");
  for (const cookie of response.cookies.getAll()) {
    if (!cookie.value || !cookie.name.includes("auth-token")) continue;
    response.cookies.set(cookie.name, cookie.value, options);
  }
}

async function readTokenRow(tokenHash: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_access_resend_tokens")
    .select("id, customer_id, expires_at, revoked_at, used_at, next_path")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    console.error("[acces] lecture");
    return null;
  }
  return data;
}

async function claimToken(tokenHash: string, now: Date) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_access_resend_tokens")
    .update({ used_at: now.toISOString() })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .select("id, customer_id")
    .maybeSingle();
  if (error) {
    console.error("[acces] ouverture");
    return null;
  }
  return data;
}

async function releaseToken(id: string) {
  const admin = createServiceClient();
  const { error } = await admin.from("crm_access_resend_tokens").update({ used_at: null }).eq("id", id);
  if (error) console.error("[acces] le jeton n’a pas pu être rendu");
}

async function loadCustomer(customerId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_customers")
    .select("id, email, auth_user_id, phone")
    .eq("id", customerId)
    .maybeSingle();
  if (error || !data?.email || !data.auth_user_id) return null;
  return data;
}

function destinationFor(user: User, nextPath: string) {
  if (mustSetPassword(user)) return SET_PASSWORD_PATH;
  const home = signedInClientDestination({
    mustSetPassword: false,
    needsOnboarding: needsClientOnboarding(user),
    staff: false,
  });
  if (home !== "/mon-compte") return home;
  return accessNextPath(nextPath);
}

/**
 * Vérifie le jeton CRM, puis ouvre la session (generateLink + verifyOtp)
 * ou la page du mot de passe. Le lien Supabase n’est pas conservé.
 */
export async function openAccessToken(request: Request, rawToken: string, opts?: { forceOpen?: boolean }) {
  const origin = originOf(request);
  const token = rawToken.trim();
  const tokenOk = isAccessToken(token);
  const now = new Date();
  const openRequested = opts?.forceOpen === true || new URL(request.url).searchParams.get("ouvrir") === "1";
  const previewBot = isPreviewBot(request.headers.get("user-agent"));
  const row = tokenOk ? await readTokenRow(hashAccessToken(token)) : null;
  const nextPath = accessNextPath(row?.next_path);
  const alive = accessRowAlive(row, now);
  const customer = row?.customer_id ? await loadCustomer(row.customer_id) : null;
  if (!openRequested || previewBot) {
    return html(tokenOk && alive && customer ? accessPreviewMarkup() : accessDeadMarkup(), tokenOk && alive && customer ? 200 : 410);
  }
  if (!tokenOk || !alive || !customer) return html(accessDeadMarkup(), 410);

  const response = NextResponse.redirect(new URL("/mon-compte", origin), 303);
  response.headers.set("Cache-Control", "private, no-store");
  const supabase = await cookieClient(response);
  const jar = await cookies();
  let existing: User | null = null;
  if (hasAuthSessionCookie(jar.getAll().map((cookie) => cookie.name))) {
    const found = await supabase.auth.getUser().catch(() => null);
    existing = found?.data.user ?? null;
  }
  const gate = accessLinkGate({
    tokenOk: true,
    alive: true,
    openRequested: true,
    previewBot: false,
    sessionEmail: existing?.email,
    accountEmail: customer.email,
  });
  if (gate === "busy") return html(accessBusyMarkup(), 409);
  if (gate === "same" && existing) {
    response.headers.set("Location", new URL(destinationFor(existing, nextPath), origin).toString());
    return response;
  }

  const tokenHash = hashAccessToken(token);
  const claimed = await claimToken(tokenHash, now);
  if (!claimed) return html(accessDeadMarkup(), 410);

  const admin = createServiceClient();
  const { data: userWrap } = await admin.auth.admin.getUserById(customer.auth_user_id);
  const account = userWrap.user;
  if (!account) {
    await releaseToken(claimed.id);
    return html(accessDeadMarkup(), 410);
  }
  const mustSet = mustSetPassword(account);
  const otp = accessOtpType(mustSet);
  const generated = await admin.auth.admin.generateLink({
    type: otp,
    email: customer.email,
  });
  const hashed = generated.data?.properties?.hashed_token || "";
  if (generated.error || !hashed) {
    console.error("[acces] session indisponible");
    await releaseToken(claimed.id);
    return html(accessDeadMarkup(), 410);
  }
  const verified = await supabase.auth.verifyOtp({ token_hash: hashed, type: otp as EmailOtpType });
  const user = verified.data.user ?? null;
  if (verified.error || !user) {
    console.error("[acces] vérification refusée");
    await releaseToken(claimed.id);
    return html(accessDeadMarkup(), 410);
  }

  if ((await getStaffForUser(user.id)) || (await isStaffAccount(admin, user.id))) {
    await supabase.auth.signOut({ scope: "local" });
    await admin.from("crm_access_resend_tokens").update({ revoked_at: now.toISOString() }).eq("id", claimed.id);
    const refusal = html(accessDeadMarkup(), 403);
    for (const cookie of response.cookies.getAll()) refusal.cookies.set(cookie);
    return refusal;
  }

  await ensureCustomerForUser(user);
  finishClientCookies(response);
  const dest = mustSet ? SET_PASSWORD_PATH : destinationFor(user, nextPath);
  response.headers.set("Location", new URL(dest, origin).toString());
  if (dest === SET_PASSWORD_PATH) {
    const meta = user.app_metadata || {};
    if (meta.must_set_password !== true) {
      await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...meta, must_set_password: true } });
    }
    response.cookies.set(PASSWORD_SETUP_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60,
    });
  }
  const userId = user.id;
  const method = loginMethodFromCallback(otp);
  after(async () => {
    await recordCustomerLogin(userId, method);
    await admin
      .from("crm_customers")
      .update({ whatsapp_opt_in_at: now.toISOString() })
      .eq("id", customer.id)
      .is("whatsapp_opt_in_at", null);
  });
  return response;
}
