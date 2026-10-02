import type { EmailOtpType } from "@supabase/supabase-js";
import { createAnonAuthClient } from "@/lib/supabase/bearer";
import { createServiceClient } from "@/lib/supabase/admin";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { recordCustomerLogin } from "@/lib/crm/customer-login";
import { isEntryCode, safeOtpType, storedEntryEmail } from "@/lib/crm/entry-link";
import {
  mobileClientGate,
  mobileSessionSnapshot,
  mobileSessionTokens,
  type MobileSessionTokens,
} from "@/lib/crm/mobile-auth";
import type { CrmCustomer } from "@/lib/crm/types";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export function asMobileOtpType(value: string | null | undefined): EmailOtpType {
  if (value && OTP_TYPES.has(value as EmailOtpType)) return value as EmailOtpType;
  return "magiclink";
}

export type MobileAuthOk = {
  ok: true;
  session: MobileSessionTokens;
  snapshot: ReturnType<typeof mobileSessionSnapshot>;
};

export type MobileAuthErr = { ok: false; error: string; status: number };

async function staffForAuthUser(userId: string) {
  try {
    const admin = createServiceClient();
    const { data } = await admin.from("crm_staff").select("id").eq("auth_user_id", userId).maybeSingle();
    return Boolean(data?.id);
  } catch {
    return false;
  }
}

export async function snapshotForUser(user: {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
}): Promise<MobileAuthOk | MobileAuthErr> {
  const customer = await ensureCustomerForUser(user as never);
  const staff = await staffForAuthUser(user.id);
  const gate = mobileClientGate({
    user: { id: user.id, email: user.email || null, app_metadata: user.app_metadata },
    customer: customer
      ? {
          id: customer.id,
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone,
          email: customer.email,
        }
      : null,
    staff: Boolean(staff),
  });
  if (!gate.ok) return { ok: false, error: gate.error, status: gate.status };
  return {
    ok: true,
    session: {
      access_token: "",
      refresh_token: "",
      expires_in: 0,
      token_type: "bearer",
    },
    snapshot: mobileSessionSnapshot({
      user: gate.user,
      customer: gate.customer,
      staff: false,
    }),
  };
}

export async function mobileSessionFromPassword(email: string, password: string) {
  const supabase = createAnonAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user || !data.session) {
    return { ok: false as const, error: "Identifiants incorrects.", status: 401 };
  }
  return finalizeMobileSession(data.user, data.session, "password");
}

export async function mobileSessionFromRefresh(refreshToken: string) {
  const supabase = createAnonAuthClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.user || !data.session) {
    return { ok: false as const, error: "Session expirée.", status: 401 };
  }
  return finalizeMobileSession(data.user, data.session, null);
}

export async function mobileSessionFromOtp(input: {
  tokenHash?: string | null;
  code?: string | null;
  type?: string | null;
}) {
  const supabase = createAnonAuthClient();
  if (input.code) {
    const exchanged = await supabase.auth.exchangeCodeForSession(input.code);
    if (exchanged.error || !exchanged.data.user || !exchanged.data.session) {
      return { ok: false as const, error: "Lien invalide ou déjà utilisé.", status: 401 };
    }
    const method: "magiclink" | "invite" | "recovery" =
      input.type === "invite" || input.type === "recovery" ? input.type : "magiclink";
    return finalizeMobileSession(exchanged.data.user, exchanged.data.session, method);
  }
  if (input.tokenHash) {
    const verified = await supabase.auth.verifyOtp({
      token_hash: input.tokenHash,
      type: asMobileOtpType(input.type),
    });
    if (verified.error || !verified.data.user || !verified.data.session) {
      return { ok: false as const, error: "Lien invalide ou déjà utilisé.", status: 401 };
    }
    const method: "magiclink" | "invite" | "recovery" =
      input.type === "invite" || input.type === "recovery" ? input.type : "magiclink";
    return finalizeMobileSession(verified.data.user, verified.data.session, method);
  }
  return { ok: false as const, error: "Lien requis.", status: 400 };
}

export async function mobileSessionFromEntry(code: string) {
  const safe = isEntryCode(code) ? code : "";
  if (!safe) return { ok: false as const, error: "Lien invalide ou déjà utilisé.", status: 401 };
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_entry_links")
    .select("token_hash, otp_type, email")
    .eq("code", safe)
    .maybeSingle();
  const link = data as { token_hash?: string | null; otp_type?: string | null; email?: string | null } | null;
  if (!link?.token_hash) {
    return { ok: false as const, error: "Lien invalide ou déjà utilisé.", status: 401 };
  }
  const first = await mobileSessionFromOtp({
    tokenHash: link.token_hash,
    type: safeOtpType(link.otp_type),
  });
  if (first.ok) return first;
  const email = storedEntryEmail(link.email);
  if (!email) return first;
  try {
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const hash = generated.data?.properties?.hashed_token || null;
    if (!hash) return first;
    return mobileSessionFromOtp({ tokenHash: hash, type: "magiclink" });
  } catch {
    return first;
  }
}

async function finalizeMobileSession(
  user: {
    id: string;
    email?: string | null;
    app_metadata?: Record<string, unknown> | null;
  },
  session: { access_token?: string | null; refresh_token?: string | null; expires_in?: number | null },
  loginMethod: "password" | "magiclink" | "invite" | "recovery" | "entry" | null
) {
  const tokens = mobileSessionTokens(session);
  if (!tokens) return { ok: false as const, error: "Session impossible.", status: 401 };
  const customer = (await ensureCustomerForUser(user as never)) as CrmCustomer | null;
  const staff = await staffForAuthUser(user.id);
  const gate = mobileClientGate({
    user: { id: user.id, email: user.email || null, app_metadata: user.app_metadata },
    customer: customer
      ? {
          id: customer.id,
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone,
          email: customer.email,
        }
      : null,
    staff: Boolean(staff),
  });
  if (!gate.ok) return { ok: false as const, error: gate.error, status: gate.status };
  if (loginMethod && !staff) {
    await recordCustomerLogin(user.id, loginMethod);
  }
  return {
    ok: true as const,
    session: tokens,
    snapshot: mobileSessionSnapshot({
      user: gate.user,
      customer: gate.customer,
    }),
  };
}
