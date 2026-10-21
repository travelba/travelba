import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { hotelSearchAllowed } from "@/lib/crm/hotel-search";
import { guestNameOk } from "@/lib/crm/hotel-journey";
import { createHotelRequest } from "@/lib/crm/hotel-search-store";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelSearchAllowed(auth.customer)) return jsonError("Introuvable", 404);
  const body = (await request.json().catch(() => null)) as { offerId?: unknown; guests?: unknown } | null;
  const offerId = typeof body?.offerId === "string" ? body.offerId : "";
  const guests = Array.isArray(body?.guests)
    ? body.guests.map((entry) => (typeof entry === "string" ? entry.replace(/\s+/g, " ").trim() : ""))
    : [];
  if (!UUID.test(offerId)) return jsonError("Cette offre n’est plus disponible.", 400);
  if (!guests.length || guests.some((name) => !guestNameOk(name))) {
    return jsonError("Indiquez le prénom et le nom de chaque chambre.", 400);
  }
  try {
    const result = await createHotelRequest(auth.customer.id, offerId, guests);
    if (!result.ok) return jsonError(result.message, 400);
    return NextResponse.json({ ok: true, message: result.message });
  } catch {
    return jsonError("La demande n’a pas pu être envoyée.", 500);
  }
}
