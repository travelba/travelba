import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";
import { LOGIN_FAILURE_MESSAGE } from "@/lib/crm/login-message";
import {
  adminClientCode,
  attemptClientLogin,
  clientAddress,
  deskClearCookie,
  deskSetCookie,
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
  const { data } = await admin
    .from("crm_customers")
    .select("auth_user_id")
    .eq("email", email)
    .maybeSingle();
  if (!data) return null;
  const authUserId = typeof data.auth_user_id === "string" ? data.auth_user_id : null;
  return { authUserId };
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
