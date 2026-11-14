import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/crm/auth";
import { requestIsSecure, stampClientSession } from "@/lib/crm/client-session-cookie";
import { signupCookieWrite } from "@/lib/crm/self-signup";
import { signupStatus } from "@/lib/crm/self-signup-run";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secureOf(request: Request) {
  return requestIsSecure({
    forwardedProto: request.headers.get("x-forwarded-proto"),
    protocol: new URL(request.url).protocol,
  });
}

export async function GET(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const status = await signupStatus(auth.customer.id);
  if (!status) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const secure = secureOf(request);
  const response = NextResponse.json(status);
  const cookie = signupCookieWrite(status.step === "ouvert" ? "done" : "pending", secure);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  if (status.step === "ouvert") {
    const supabase = await createClient();
    await supabase.auth.refreshSession().catch(() => null);
    stampClientSession(response, (await cookies()).getAll(), secure);
  }
  return response;
}
