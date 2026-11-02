import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { hotelBookingEnabled } from "@/lib/crm/hotel-access";
import { hotelActivityMode } from "@/lib/crm/hotel-activity";
import { recordHotelClientActivity } from "@/lib/crm/hotel-activity-run";
import { guestNameOk } from "@/lib/crm/hotel-journey";
import { createHotelRequest } from "@/lib/crm/hotel-search-store";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelBookingEnabled(auth.customer)) return jsonError("Introuvable", 404);
  const body = (await request.json().catch(() => null)) as { offerId?: unknown; guests?: unknown } | null;
  const offerId = typeof body?.offerId === "string" ? body.offerId : "";
  const guests = Array.isArray(body?.guests)
    ? body.guests.map((entry) => (typeof entry === "string" ? entry.replace(/\s+/g, " ").trim() : ""))
    : [];
  const mode = hotelActivityMode(auth.customer);
  if (!UUID.test(offerId)) {
    await recordHotelClientActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      mode,
      gesture: { kind: "error", where: "demande", message: "Cette offre n’est plus disponible." },
    });
    return jsonError("Cette offre n’est plus disponible.", 400);
  }
  if (!guests.length || guests.some((name) => !guestNameOk(name))) {
    await recordHotelClientActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      mode,
      gesture: { kind: "error", where: "demande", message: "Indiquez le prénom et le nom de chaque chambre." },
    });
    return jsonError("Indiquez le prénom et le nom de chaque chambre.", 400);
  }
  try {
    const result = await createHotelRequest(auth.customer.id, offerId, guests);
    if (!result.ok) {
      await recordHotelClientActivity({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        mode,
        gesture: { kind: "error", where: "demande", message: result.message },
      });
      return jsonError(result.message, 400);
    }
    await recordHotelClientActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      mode,
      gesture: { kind: "request", via: "offre", hotel: result.hotel, room: result.room || undefined, pay: "agence" },
    });
    return NextResponse.json({ ok: true, message: result.message });
  } catch {
    await recordHotelClientActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      mode,
      gesture: { kind: "error", where: "demande", message: "La demande n’a pas pu être envoyée." },
    });
    return jsonError("La demande n’a pas pu être envoyée.", 500);
  }
}
