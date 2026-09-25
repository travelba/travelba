import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { carnetVisible } from "@/lib/crm/carnet";
import { openRolzoSession, RolzoError, rolzoWebHost } from "@/lib/crm/rolzo";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const row = booking as CrmBooking;
  const { data: items } = await auth.supabase
    .from("crm_booking_items")
    .select("id, kind, visible_to_client")
    .eq("booking_id", row.id);
  if (!carnetVisible(row, (items || []) as CrmBookingItem[])) return jsonError("Séjour introuvable", 404);
  try {
    const encodedData = await openRolzoSession(auth.customer);
    return NextResponse.json({ encodedData, webHost: rolzoWebHost() });
  } catch (err) {
    if (err instanceof RolzoError) return jsonError(err.message, err.status);
    return jsonError("La session chauffeur n’a pas pu s’ouvrir.", 502);
  }
}
