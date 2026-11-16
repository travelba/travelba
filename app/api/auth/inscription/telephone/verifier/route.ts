import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { checkSignupCode, signupRequestIp } from "@/lib/crm/self-signup-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const checked = await checkSignupCode(
    auth.customer.id,
    typeof body?.code === "string" ? body.code.trim() : "",
    signupRequestIp(request.headers)
  );
  if (!checked.ok) return jsonError(checked.message, 400);
  return NextResponse.json({ ok: true });
}
