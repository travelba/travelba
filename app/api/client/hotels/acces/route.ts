import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { HOTEL_ACCESS_COPY, hotelBookingEnabled } from "@/lib/crm/hotel-access";
import { hotelActivityMode } from "@/lib/crm/hotel-activity";
import { recordHotelClientActivity } from "@/lib/crm/hotel-activity-run";
import { requestHotelAccess } from "@/lib/crm/hotel-access-run";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const mode = hotelActivityMode(auth.customer);
  try {
    const result = await requestHotelAccess(auth.customer.id, hotelBookingEnabled(auth.customer));
    if (!result.ok) {
      await recordHotelClientActivity({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        mode,
        gesture: { kind: "error", where: "acces", message: result.error },
      });
      return jsonError(result.error, 400);
    }
    await recordHotelClientActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      mode,
      gesture: {
        kind: "request",
        via: "acces",
        already: result.action === "already",
        repeat: result.action === "existing",
      },
    });
    return NextResponse.json({ ok: true, message: HOTEL_ACCESS_COPY.sent, action: result.action });
  } catch {
    await recordHotelClientActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      mode,
      gesture: { kind: "error", where: "acces", message: "La demande n’a pas pu être envoyée." },
    });
    return jsonError("La demande n’a pas pu être envoyée.", 500);
  }
}
