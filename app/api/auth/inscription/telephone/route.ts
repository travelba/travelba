import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { sendSignupCode, signupRequestIp } from "@/lib/crm/self-signup-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { phone?: unknown } | null;
  const sent = await sendSignupCode(
    auth.customer.id,
    typeof body?.phone === "string" ? body.phone : "",
    signupRequestIp(request.headers)
  );
  if (!sent.ok) return jsonError(sent.message, 400);
  return NextResponse.json({ ok: true });
}
