import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { issueBookingCard } from "@/lib/crm/booking-cards";
import { pliantConfigured, pliantPciWidget } from "@/lib/crm/pliant";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as
    | { action?: string; amount?: string; firstName?: string; lastName?: string; itemId?: string }
    | null;
  const action = body?.action;
  if (!action) return jsonError("Action incomplète", 400);

  const admin = createServiceClient();

  if (action === "issue") {
    try {
      await issueBookingCard(admin, {
        bookingId: id,
        amount: typeof body?.amount === "string" ? body.amount : "",
        firstName: typeof body?.firstName === "string" ? body.firstName : "",
        lastName: typeof body?.lastName === "string" ? body.lastName : "",
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "La carte n’a pas pu être créée.", 400);
    }
  }

  if (action === "card") {
    const cardId = (body?.itemId || "").trim();
    if (!cardId) return jsonError("Carte introuvable.", 404);
    const { data } = await admin
      .from("crm_booking_cards")
      .select("id, pliant_card_id")
      .eq("booking_id", id)
      .eq("id", cardId)
      .maybeSingle();
    const row = data as { id: string; pliant_card_id: string } | null;
    if (!row?.pliant_card_id) return jsonError("Carte introuvable.", 404);
    if (!pliantConfigured()) return jsonError("Pliant n’est pas branché.", 400);
    try {
      const widget = await pliantPciWidget(row.pliant_card_id, `carte-${row.id}`);
      return NextResponse.json({ widgetUrl: widget.src, frameId: widget.frameId });
    } catch {
      return jsonError("La carte n’a pas pu être lue.", 502);
    }
  }

  return jsonError("Action inconnue", 400);
}
