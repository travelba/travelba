import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { calendarHttpResponse } from "@/lib/crm/calendar-http";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const itemId = new URL(request.url).searchParams.get("item_id");

  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const b = booking as CrmBooking;

  const { data: items } = await auth.supabase
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", b.id)
    .order("sort_order");

  return calendarHttpResponse({
    request,
    booking: b,
    items: (items || []) as CrmBookingItem[],
    itemId,
    allowPhoneFeed: b.visible_to_client,
  });
}
