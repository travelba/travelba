import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { createEmailSignup, signupRequestIp } from "@/lib/crm/self-signup-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const created = await createEmailSignup({ email, password, ip: signupRequestIp(request.headers) });
  if (!created.ok) return jsonError(created.message, 400);
  return NextResponse.json({ ok: true });
}
