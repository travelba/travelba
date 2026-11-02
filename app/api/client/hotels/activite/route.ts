import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { hotelBookingEnabled } from "@/lib/crm/hotel-access";
import { hotelActivityMode, parseHotelActivityBody } from "@/lib/crm/hotel-activity";
import { recordHotelClientActivity } from "@/lib/crm/hotel-activity-run";

export const runtime = "nodejs";

/** Tri, page, filtre, suggestion, chambre : le serveur calcule la phrase. */
export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelBookingEnabled(auth.customer)) return jsonError("Introuvable", 404);
  const gesture = parseHotelActivityBody(await request.json().catch(() => null));
  if (!gesture) return jsonError("Geste inconnu.", 400);
  await recordHotelClientActivity({
    customerId: auth.customer.id,
    authUserId: auth.user.id,
    gesture,
    mode: hotelActivityMode(auth.customer),
  });
  return NextResponse.json({ ok: true });
}
