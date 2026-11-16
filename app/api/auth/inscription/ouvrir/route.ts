import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { requestIsSecure, stampClientSession } from "@/lib/crm/client-session-cookie";
import { signupCookieWrite } from "@/lib/crm/self-signup";
import { openSelfSignup } from "@/lib/crm/self-signup-run";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { adult?: unknown; terms?: unknown } | null;
  const opened = await openSelfSignup({
    customerId: auth.customer.id,
    userId: auth.user.id,
    adult: body?.adult === true,
    terms: body?.terms === true,
  });
  if (!opened.ok) return jsonError(opened.message, 400);
  const supabase = await createClient();
  await supabase.auth.refreshSession().catch(() => null);
  const secure = requestIsSecure({
    forwardedProto: request.headers.get("x-forwarded-proto"),
    protocol: new URL(request.url).protocol,
  });
  const response = NextResponse.json({ ok: true });
  const cookie = signupCookieWrite("done", secure);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  stampClientSession(response, (await cookies()).getAll(), secure);
  return response;
}
