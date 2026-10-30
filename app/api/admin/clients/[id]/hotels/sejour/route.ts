import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { actOnDirectStay } from "@/lib/crm/hotel-direct-run";
import type { StayEvent } from "@/lib/crm/hotel-direct";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError("Client introuvable", 404);
  const body = (await request.json().catch(() => null)) as {
    stayId?: unknown;
    action?: unknown;
    text?: unknown;
    hotelCents?: unknown;
  } | null;
  const stayId = typeof body?.stayId === "string" ? body.stayId : "";
  if (!UUID.test(stayId)) return jsonError("Demande introuvable.", 400);
  const action = typeof body?.action === "string" ? body.action : "";
  let event: StayEvent | null = null;
  if (action === "reply" && typeof body?.text === "string") event = { type: "reply", text: body.text.slice(0, 4000) };
  else if (action === "mark_paid") event = { type: "mark_paid" };
  else if (action === "mark_link_expired") event = { type: "mark_link_expired" };
  else if (action === "send_card") event = { type: "send_card" };
  else if (action === "price_ok" && Number.isInteger(body?.hotelCents)) event = { type: "price_ok", hotelCents: body?.hotelCents as number };
  else if (action === "cancel_agency") event = { type: "cancel_agency" };
  else if (action === "cancel_hotel") event = { type: "cancel_hotel" };
  else if (action === "refund_now") event = { type: "refund_now" };
  if (!event) return jsonError("Action inconnue.", 400);
  try {
    const result = await actOnDirectStay({ customerId: id, stayId, event, actor: "agency" });
    if (!result.ok) return jsonError(result.message, 400);
    if (event.type === "refund_now") {
      // Alerte informative : le remboursement est lancé, rien n’attend de validation.
      await recordAgencyJournal({
        staffId: auth.staff.id,
        action: "update",
        entityType: "finance",
        entityId: stayId,
        summary: "Remboursement du client lancé (séjour hôtel direct).",
        sensitive: "refund",
        path: `/api/admin/clients/${id}/hotels/sejour`,
      });
    }
    return NextResponse.json({ ok: true, view: result.view });
  } catch {
    return jsonError("L’action n’a pas abouti.", 500);
  }
}
