import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser, ensureStaff } from "@/lib/crm/auth";
import { SET_PASSWORD_PATH, mustSetPassword } from "@/lib/crm/session";

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

  if (mustSetPassword(user) || type === "recovery" || type === "invite") {
    return NextResponse.redirect(new URL(SET_PASSWORD_PATH, url.origin));
  }

  const dest =
    next.startsWith("/admin") && staff
      ? next
      : next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/mon-compte";
  return NextResponse.redirect(new URL(dest, url.origin));
}
