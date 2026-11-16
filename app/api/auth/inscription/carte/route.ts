import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { signupSetupIntent } from "@/lib/crm/self-signup-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const opened = await signupSetupIntent(auth.customer);
  if (!opened.ok) return jsonError(opened.message, 400);
  return NextResponse.json({ clientSecret: opened.clientSecret });
}
