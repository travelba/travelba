import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { hotelBookingEnabled, hotelDirectLive } from "@/lib/crm/hotel-access";
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
  if (!UUID.test(offerId)) return jsonError("Cette offre n’est plus disponible.", 400);
  if (!guests.length || guests.some((name) => !guestNameOk(name))) {
    return jsonError("Indiquez le prénom et le nom de chaque chambre.", 400);
  }
  if (!payMethod) return jsonError("Choisissez un règlement.", 400);
  const live = hotelDirectLive(auth.customer);
  try {
    if (payMethod === "card" && live && !intentId) {
      const hold = await beginDirectCard({ customer: auth.customer, offerId });
      if (!hold.ok) return jsonError(hold.message, 400);
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
    if (!opened.ok) return jsonError(opened.message, 400);
    return NextResponse.json({ ok: true, view: opened.view, trial: !live });
  } catch {
    return jsonError("La demande n’a pas pu être envoyée.", 500);
  }
}
