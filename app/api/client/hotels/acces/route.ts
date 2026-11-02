import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { HOTEL_ACCESS_COPY, hotelBookingEnabled } from "@/lib/crm/hotel-access";
import { requestHotelAccess } from "@/lib/crm/hotel-access-run";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await requestHotelAccess(auth.customer.id, hotelBookingEnabled(auth.customer));
    if (!result.ok) return jsonError(result.error, 400);
    return NextResponse.json({ ok: true, message: HOTEL_ACCESS_COPY.sent, action: result.action });
  } catch {
    return jsonError("La demande n’a pas pu être envoyée.", 500);
  }
}
