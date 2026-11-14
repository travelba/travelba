import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { confirmSignupCard } from "@/lib/crm/self-signup-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { setupIntentId?: unknown } | null;
  const saved = await confirmSignupCard(
    auth.customer.id,
    typeof body?.setupIntentId === "string" ? body.setupIntentId : ""
  );
  if (!saved.ok) return jsonError(saved.message, 400);
  return NextResponse.json({ ok: true, last4: saved.last4 });
}
