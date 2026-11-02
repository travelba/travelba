import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { hotelBookingEnabled, hotelDirectLive } from "@/lib/crm/hotel-access";
import { hotelActivityMode } from "@/lib/crm/hotel-activity";
import { recordHotelClientActivity } from "@/lib/crm/hotel-activity-run";
import { beginDirectCard, openDirectStay } from "@/lib/crm/hotel-direct-run";
import { guestNameOk } from "@/lib/crm/hotel-journey";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTENT = /^pi_[A-Za-z0-9]+$/;

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelBookingEnabled(auth.customer)) return jsonError("Introuvable", 404);
  const body = (await request.json().catch(() => null)) as {
    offerId?: unknown;
    guests?: unknown;
    payMethod?: unknown;
    arrival?: unknown;
    intentId?: unknown;
  } | null;
  const offerId = typeof body?.offerId === "string" ? body.offerId : "";
  const guests = Array.isArray(body?.guests)
    ? body.guests.map((entry) => (typeof entry === "string" ? entry.replace(/\s+/g, " ").trim() : "")).filter(Boolean)
    : [];
  const payMethod = body?.payMethod === "agency" ? "agency" : body?.payMethod === "card" ? "card" : null;
  const arrival = typeof body?.arrival === "string" ? body.arrival.replace(/[^\d:h ]/g, "").trim().slice(0, 12) : null;
  const intentId = typeof body?.intentId === "string" && INTENT.test(body.intentId) ? body.intentId : null;
  const mode = hotelActivityMode(auth.customer);
  if (!UUID.test(offerId)) {
    await noteError(auth.customer.id, auth.user.id, mode, "Cette offre n’est plus disponible.");
    return jsonError("Cette offre n’est plus disponible.", 400);
  }
  if (!guests.length || guests.some((name) => !guestNameOk(name))) {
    await noteError(auth.customer.id, auth.user.id, mode, "Indiquez le prénom et le nom de chaque chambre.");
    return jsonError("Indiquez le prénom et le nom de chaque chambre.", 400);
  }
  if (!payMethod) {
    await noteError(auth.customer.id, auth.user.id, mode, "Choisissez un règlement.");
    return jsonError("Choisissez un règlement.", 400);
  }
  const live = hotelDirectLive(auth.customer);
  try {
    if (payMethod === "card" && live && !intentId) {
      const hold = await beginDirectCard({ customer: auth.customer, offerId });
      if (!hold.ok) {
        await noteError(auth.customer.id, auth.user.id, mode, hold.message);
        return jsonError(hold.message, 400);
      }
      return NextResponse.json({ ok: true, clientSecret: hold.clientSecret, intentId: hold.intentId });
    }
    const opened = await openDirectStay({
      customer: auth.customer,
      offerId,
      guests,
      arrival,
      payMethod,
      stripeIntent: intentId,
    });
    if (!opened.ok) {
      await noteError(auth.customer.id, auth.user.id, mode, opened.message);
      return jsonError(opened.message, 400);
    }
    await recordHotelClientActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      mode,
      gesture: {
        kind: "request",
        via: "offre",
        hotel: opened.view.hotelName,
        room: opened.view.room || undefined,
        pay: payMethod === "card" ? "carte" : "agence",
      },
    });
    return NextResponse.json({ ok: true, view: opened.view, trial: !live });
  } catch {
    await noteError(auth.customer.id, auth.user.id, mode, "La demande n’a pas pu être envoyée.");
    return jsonError("La demande n’a pas pu être envoyée.", 500);
  }
}

function noteError(customerId: string, authUserId: string, mode: "essai" | "réel", message: string) {
  return recordHotelClientActivity({
    customerId,
    authUserId,
    mode,
    gesture: { kind: "error", where: "demande", message },
  });
}
