import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { revealStayCard } from "@/lib/crm/hotel-card-reveal";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmHotelArrival } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { itemId?: string; code?: string } | null;
  const itemId = (body?.itemId || "").trim();
  if (!itemId) return jsonError("Carte introuvable", 404);

  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("id, visible_to_client")
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (!booking?.visible_to_client) return jsonError("Carte introuvable", 404);

  const { data: item } = await auth.supabase
    .from("crm_booking_items")
    .select("id, kind, visible_to_client")
    .eq("id", itemId)
    .eq("booking_id", id)
    .maybeSingle();
  if (!item || item.kind !== "hotel" || item.visible_to_client === false) {
    return jsonError("Carte introuvable", 404);
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return jsonError("La carte n’a pas pu être lue.", 503);
  }
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("id, pliant_card_id, card_closed_at")
    .eq("booking_id", id)
    .eq("booking_item_id", itemId)
    .maybeSingle();
  const row = data as Pick<CrmHotelArrival, "id" | "pliant_card_id" | "card_closed_at"> | null;
  if (!row?.pliant_card_id) return jsonError("Carte introuvable", 404);

  const revealed = await revealStayCard({
    admin,
    rowId: row.id,
    pliantCardId: row.pliant_card_id,
    closed: Boolean(row.card_closed_at),
    code: typeof body?.code === "string" ? body.code : "",
    audience: "client",
  });
  if ("error" in revealed) return jsonError(revealed.error, revealed.status);
  return NextResponse.json(revealed.secrets);
}
