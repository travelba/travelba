import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { saveSignupIdentity } from "@/lib/crm/self-signup-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { firstName?: unknown; lastName?: unknown } | null;
  const saved = await saveSignupIdentity(
    auth.customer.id,
    typeof body?.firstName === "string" ? body.firstName : "",
    typeof body?.lastName === "string" ? body.lastName : ""
  );
  if (!saved.ok) return jsonError(saved.message, 400);
  return NextResponse.json({ ok: true });
}
