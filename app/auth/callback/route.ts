import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureCustomerForUser, ensureStaff } from "@/lib/crm/auth";
import { loginMethodFromCallback, recordCustomerLogin } from "@/lib/crm/customer-login";
import {
  PASSWORD_SETUP_COOKIE,
  SET_PASSWORD_PATH,
  mustSetPassword,
  shouldForcePasswordSetup,
} from "@/lib/crm/session";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function asOtpType(value: string | null): EmailOtpType | null {
  if (!value) return null;
  return OTP_TYPES.has(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = asOtpType(url.searchParams.get("type"));
  const next = url.searchParams.get("next") || "/mon-compte";
  const exchanged = Boolean(code || tokenHash);
  const supabase = await createClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash) {
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type || "invite",
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/connexion?error=auth", url.origin));
  }

  await ensureCustomerForUser(user);
  const staff = await ensureStaff(user);
  if (exchanged && !staff) {
    await recordCustomerLogin(user.id, loginMethodFromCallback(type));
  }
  const forcePassword = shouldForcePasswordSetup({
    flagged: mustSetPassword(user),
    type,
    next,
  });

  if (forcePassword) {
    await stampMustSetPassword(user.id);
    const response = NextResponse.redirect(new URL(SET_PASSWORD_PATH, url.origin));
    response.cookies.set(PASSWORD_SETUP_COOKIE, "1", passwordSetupCookieOptions(true));
    return response;
  }

  const dest =
    next.startsWith("/admin") && staff
      ? next
      : next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/mon-compte";
  const response = NextResponse.redirect(new URL(dest, url.origin));
  response.cookies.set(PASSWORD_SETUP_COOKIE, "", passwordSetupCookieOptions(false));
  return response;
}

function passwordSetupCookieOptions(active: boolean) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: active ? 60 * 60 : 0,
  };
}

async function stampMustSetPassword(userId: string) {
  try {
    const admin = createServiceClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    const meta = data.user?.app_metadata || {};
    if (meta.must_set_password === true) return;
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...meta, must_set_password: true },
    });
  } catch {
    console.error("[auth/callback] impossible de poser must_set_password");
  }
}
