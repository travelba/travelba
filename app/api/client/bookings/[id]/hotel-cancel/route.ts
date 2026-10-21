import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { carnetVisible } from "@/lib/crm/carnet";
import { recordCustomerActivity } from "@/lib/crm/customer-activity";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";
import { cancelClientLeHotel } from "@/lib/crm/le-client-cancel";
import { CLIENT_CANCEL_ADVISOR, CLIENT_CANCEL_REFUSED } from "@/lib/crm/le-free-cancel";
import { isActiveItem, type CrmBooking, type CrmBookingItem } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Annulation directe d’une carte hôtel Little Emperors.
 * Le titulaire seulement. Le DELETE part après une relecture, et seulement si c’est gratuit.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const jar = await cookies();
  if (deskBypass(jar.get(DESK_COOKIE)?.value, auth.user.id)) {
    return jsonError(CLIENT_CANCEL_ADVISOR, 403);
  }
  const { id: reference } = await ctx.params;
  const body = await request.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) {
    return jsonError(CLIENT_CANCEL_REFUSED, 409);
  }
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking || booking.customer_id !== auth.customer.id) return jsonError("Séjour introuvable", 404);
  const stay = booking as CrmBooking;
  const { data: items } = await auth.supabase.from("crm_booking_items").select("*").eq("booking_id", stay.id);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(stay, list)) return jsonError("Séjour introuvable", 404);
  const item = list.find((row) => row.id === itemId && row.kind === "hotel" && isActiveItem(row));
  if (!item) return jsonError(CLIENT_CANCEL_REFUSED, 409);
  const hotels = list.filter((row) => row.kind === "hotel" && isActiveItem(row));
  const result = await cancelClientLeHotel({
    bookingId: stay.id,
    customerId: auth.customer.id,
    visibleToClient: false,
    item,
    hotels,
  });
  if (result.sent) {
    await recordCustomerActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      action: "annulation",
      bookingId: stay.id,
      summary: `A annulé un hôtel du séjour ${stay.reference}`.slice(0, 180),
      detail: item.title,
    });
  }
  if (!result.ok) return jsonError(result.message, 409);
  return NextResponse.json({ ok: true });
}
