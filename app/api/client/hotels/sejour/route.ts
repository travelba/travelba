import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { hotelBookingEnabled } from "@/lib/crm/hotel-access";
import { actOnDirectStay } from "@/lib/crm/hotel-direct-run";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelBookingEnabled(auth.customer)) return jsonError("Introuvable", 404);
  const body = (await request.json().catch(() => null)) as { stayId?: unknown; action?: unknown } | null;
  const stayId = typeof body?.stayId === "string" ? body.stayId : "";
  const action = body?.action === "cancel" ? "cancel_client" : body?.action === "ask" ? "ask_agency" : null;
  if (!UUID.test(stayId) || !action) return jsonError("Action impossible.", 400);
  try {
    const result = await actOnDirectStay({
      customerId: auth.customer.id,
      stayId,
      event: { type: action },
      actor: "client",
    });
    if (!result.ok) return jsonError(result.message, 400);
    return NextResponse.json({ ok: true, view: result.view });
  } catch {
    return jsonError("L’action n’a pas abouti.", 500);
  }
}
