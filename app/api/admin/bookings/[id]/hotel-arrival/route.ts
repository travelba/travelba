import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { parseEurosToCents } from "@/lib/crm/hotel-arrival";
import { revealStayCard } from "@/lib/crm/hotel-card-reveal";
import { advanceHotelItem } from "@/lib/crm/hotel-arrival-run";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmHotelArrival } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as
    | { itemId?: string; action?: string; net?: string; code?: string }
    | null;
  const itemId = (body?.itemId || "").trim();
  const action = body?.action;
  if (!itemId || !action) return jsonError("Action incomplète", 400);

  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("*")
    .eq("booking_id", id)
    .eq("booking_item_id", itemId)
    .maybeSingle();
  const row = data as CrmHotelArrival | null;
  if (!row) return jsonError("Suivi introuvable", 404);

  if (action === "net") {
    const cents = parseEurosToCents(body?.net || "");
    if (cents == null) return jsonError("Montant net invalide", 400);
    await admin.from("crm_hotel_arrivals").update({ net_cents: cents }).eq("id", row.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "task_done") {
    await admin.from("crm_hotel_arrivals").update({ task_open: false }).eq("id", row.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "paid") {
    await admin
      .from("crm_hotel_arrivals")
      .update({ status: "paid", paid_at: new Date().toISOString(), blocked_reason: null })
      .eq("id", row.id);
    await advanceHotelItem(admin, id, itemId);
    return NextResponse.json({ ok: true });
  }

  if (action === "card") {
    const revealed = await revealStayCard({
      admin,
      rowId: row.id,
      pliantCardId: row.pliant_card_id,
      closed: Boolean(row.card_closed_at),
      code: typeof body?.code === "string" ? body.code : "",
      audience: "staff",
    });
    if ("error" in revealed) return jsonError(revealed.error, revealed.status);
    return NextResponse.json(revealed.secrets);
  }

  return jsonError("Action inconnue", 400);
}
