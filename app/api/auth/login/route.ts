import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { LOGIN_FAILURE_MESSAGE } from "@/lib/crm/login-message";
import { recordCustomerLogin } from "@/lib/crm/customer-login";
import {
  adminClientCode,
  attemptClientLogin,
  clientAddress,
  confirmedClientUser,
  deskClearCookie,
  deskSetCookie,
  linkCustomerAuth,
  loginRoutePlan,
  openServiceSession,
} from "@/lib/crm/admin-client-login";

export const runtime = "nodejs";

function failure() {
  const response = NextResponse.json({ error: LOGIN_FAILURE_MESSAGE }, { status: 401 });
  clearDesk(response);
  return response;
}

function clearDesk(response: NextResponse) {
  const clear = deskClearCookie();
  response.cookies.set(clear.name, clear.value, clear.options);
}

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return failure();
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const feature = Boolean(adminClientCode());

  try {
    const opened = NextResponse.json({ ok: true, home: true });
    const result = await attemptClientLogin(
      { email, password, ip: clientAddress(request.headers) },
      {
        findCustomer,
        provisionAuthUser,
        openSession: (authUserId) => openClientSession(opened, authUserId),
      }
    );
    const plan = loginRoutePlan(feature, result);

    if (plan === "client-fallback") {
      const response = NextResponse.json({ fallback: true });
      clearDesk(response);
      return response;
    }

    if (plan === "reject") return failure();

    if (plan === "open") {
      if (result.action !== "open") return failure();
      const desk = deskSetCookie(result.authUserId);
      if (!desk) return failure();
      // Le mode desk ouvre l’espace d’un client : il laisse une trace dans son historique (C-03 / B-06).
      await recordCustomerLogin(result.authUserId, "desk");
      opened.cookies.set(desk.name, desk.value, desk.options);
      opened.headers.set("Cache-Control", "private, no-store");
      return opened;
    }

    const signed = NextResponse.json({ ok: true });
    const ok = await signInWithClientPassword(signed, email.trim(), password);
    if (!ok) return failure();
    clearDesk(signed);
    signed.headers.set("Cache-Control", "private, no-store");
    return signed;
  } catch {
    console.error("[auth/login] indisponible");
    return failure();
  }
}

async function findCustomer(email: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_customers")
    .select("auth_user_id")
    .eq("email", email)
    .limit(2);
  if (error || !data || data.length !== 1) return null;
  const authUserId = typeof data[0].auth_user_id === "string" ? data[0].auth_user_id : null;
  return { authUserId };
}

async function provisionAuthUser(email: string) {
  const admin = createServiceClient();
  return linkCustomerAuth(email, {
    async listByEmail(address) {
      const { data, error } = await admin
        .from("crm_customers")
        .select("id, auth_user_id")
        .eq("email", address)
        .limit(2);
      if (error || !data) return null;
      return data.map((row) => ({
        id: String(row.id),
        authUserId: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
      }));
    },
    async createConfirmedUser(address) {
      const { data, error } = await admin.auth.admin.createUser(confirmedClientUser(address));
      if (data.user?.id) return { id: data.user.id, alreadyExists: false };
      const message = error?.message || "";
      const alreadyExists = /already been registered|already registered|email_exists|user already exists/i.test(
        message
      );
      return { id: null, alreadyExists };
    },
    async findExistingUserId(address) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: address,
      });
      if (error || !data.user?.id) return null;
      return data.user.id;
    },
    async attach(customerId, authUserId) {
      const { data, error } = await admin
        .from("crm_customers")
        .update({ auth_user_id: authUserId })
        .eq("id", customerId)
        .is("auth_user_id", null)
        .select("auth_user_id")
        .maybeSingle();
      if (!error && typeof data?.auth_user_id === "string") return data.auth_user_id;
      const { data: fresh } = await admin
        .from("crm_customers")
        .select("auth_user_id")
        .eq("id", customerId)
        .maybeSingle();
      return typeof fresh?.auth_user_id === "string" ? fresh.auth_user_id : null;
    },
  });
}

async function openClientSession(response: NextResponse, authUserId: string) {
  const admin = createServiceClient();
  return openServiceSession(
    {
      async getUserById(id) {
        const { data, error } = await admin.auth.admin.getUserById(id);
        return {
          user: data.user ? { id: data.user.id, email: data.user.email } : null,
          error: Boolean(error),
        };
      },
      async generateLink(email) {
        const { data, error } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
        return {
          tokenHash: data?.properties?.hashed_token || null,
          error: Boolean(error),
        };
      },
    },
    authUserId,
    (tokenHash) => verifyToken(response, tokenHash, "magiclink")
  );
}

async function signInWithClientPassword(response: NextResponse, email: string, password: string) {
  const supabase = await supabaseOn(response);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

async function verifyToken(response: NextResponse, tokenHash: string, type: EmailOtpType) {
  const supabase = await supabaseOn(response);
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  return !verified.error;
}

async function supabaseOn(response: NextResponse) {
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();
  return createServerClient(url, anonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
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
