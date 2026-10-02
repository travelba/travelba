import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { clientVisibleItems } from "@/lib/crm/carnet";
import { espaceWalletPass } from "@/lib/crm/espace-native";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { itemId } = await ctx.params;
  const { data: item } = await auth.supabase
    .from("crm_booking_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return jsonError("Introuvable", 404);
  const row = item as CrmBookingItem;
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", row.booking_id)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (!booking) return jsonError("Introuvable", 404);
  const visible = clientVisibleItems([row]);
  const pass = visible[0] ? espaceWalletPass(booking as CrmBooking, visible[0]) : null;
  if (!pass) return jsonError("Carte Wallet indisponible", 404);
  return NextResponse.json(
    { pass, pkpass: false },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
