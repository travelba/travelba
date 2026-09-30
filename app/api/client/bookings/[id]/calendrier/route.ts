import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { calendarHttpResponse } from "@/lib/crm/calendar-http";
import { carnetVisible, clientVisibleItems } from "@/lib/crm/carnet";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const itemId = new URL(request.url).searchParams.get("item_id");

  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const b = booking as CrmBooking;

  const { data: items } = await auth.supabase
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", b.id)
    .order("sort_order");
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, list)) return jsonError("Séjour introuvable", 404);
  const visible = clientVisibleItems(list);
  if (itemId && !visible.some((row) => row.id === itemId)) return jsonError("Séjour introuvable", 404);

  return calendarHttpResponse({
    request,
    booking: b,
    items: visible,
    itemId,
  });
}
