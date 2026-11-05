import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { hotelBookingEnabled, hotelDirectLive } from "@/lib/crm/hotel-access";
import { hotelActivityMode } from "@/lib/crm/hotel-activity";
import { recordHotelClientActivity } from "@/lib/crm/hotel-activity-run";
import { openDirectStay, prepareDirectPayment } from "@/lib/crm/hotel-direct-run";
import { lePrimaryGuest } from "@/lib/crm/le-self-book";

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
    cardReady?: unknown;
    companions?: unknown;
  } | null;
  const offerId = typeof body?.offerId === "string" ? body.offerId : "";
  const cleanName = (entry: unknown) => (typeof entry === "string" ? entry.replace(/\s+/g, " ").trim().slice(0, 80) : "");
  const guests = Array.isArray(body?.guests) ? body.guests.map(cleanName).filter(Boolean) : [];
  const companions = Array.isArray(body?.companions)
    ? body.companions.slice(0, 8).map((room) => (Array.isArray(room) ? room.map(cleanName).filter(Boolean).slice(0, 5) : []))
    : [];
  const payMethod = body?.payMethod === "agency" ? "agency" : body?.payMethod === "card" ? "card" : null;
  const arrival = typeof body?.arrival === "string" ? body.arrival.replace(/[^\d:h ]/g, "").trim().slice(0, 12) : null;
  const intentId = typeof body?.intentId === "string" && INTENT.test(body.intentId) ? body.intentId : null;
  const cardReady = body?.cardReady === true;
  const mode = hotelActivityMode(auth.customer);
  if (!UUID.test(offerId)) {
    await noteError(auth.customer.id, auth.user.id, mode, "Cette offre n’est plus disponible.");
    return jsonError("Cette offre n’est plus disponible.", 400);
  }
  if (
    !guests.length ||
    guests.some((name) => !lePrimaryGuest(name)) ||
    companions.some((room) => room.some((name) => !lePrimaryGuest(name)))
  ) {
    await noteError(auth.customer.id, auth.user.id, mode, "Indiquez le prénom et le nom de chaque voyageur, une personne par ligne.");
    return jsonError("Indiquez le prénom et le nom de chaque voyageur, une personne par ligne.", 400);
  }
  if (!payMethod) {
    await noteError(auth.customer.id, auth.user.id, mode, "Choisissez un règlement.");
    return jsonError("Choisissez un règlement.", 400);
  }
  const live = hotelDirectLive(auth.customer);
  try {
    if (payMethod === "card" && live && !intentId && !cardReady) {
      const prep = await prepareDirectPayment({ customer: auth.customer, offerId, companions });
      if (!prep.ok) {
        await noteError(auth.customer.id, auth.user.id, mode, prep.message);
        return NextResponse.json(
          { error: prep.message, code: "code" in prep ? prep.code : undefined, sellCents: "sellCents" in prep ? prep.sellCents : undefined, currency: "currency" in prep ? prep.currency : undefined },
          { status: "code" in prep && prep.code === "price_changed" ? 409 : 400 }
        );
      }
      if ("widgetUrl" in prep && prep.widgetUrl) {
        return NextResponse.json({ ok: true, widgetUrl: prep.widgetUrl, widgetOrigin: prep.widgetOrigin, terms: prep.terms });
      }
      if ("clientSecret" in prep && prep.clientSecret) {
        return NextResponse.json({ ok: true, clientSecret: prep.clientSecret, intentId: prep.intentId });
      }
      return jsonError("La réservation n’a pas pu être ouverte.", 400);
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        send({ phase: "hotel" });
        try {
          const opened = await openDirectStay({
            customer: auth.customer,
            offerId,
            guests,
            companions,
            arrival,
            payMethod,
            stripeIntent: intentId,
            cardReady,
            onPhase: (phase) => send({ phase }),
          });
          if (opened.ok && "widgetUrl" in opened) {
            send({ ok: true, widgetUrl: opened.widgetUrl, widgetOrigin: opened.widgetOrigin, terms: opened.terms });
          } else if (!opened.ok) {
            await noteError(auth.customer.id, auth.user.id, mode, opened.message);
            send({
              ok: false,
              error: opened.message,
              code: opened.code,
              sellCents: opened.sellCents,
              currency: opened.currency,
              widgetUrl: "widgetUrl" in opened ? opened.widgetUrl : undefined,
              terms: "terms" in opened ? opened.terms : undefined,
              widgetOrigin: "widgetUrl" in opened && opened.widgetUrl ? new URL(opened.widgetUrl).origin : undefined,
            });
          } else {
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
            send({ ok: true, view: opened.view, trial: !live });
          }
        } catch {
          await noteError(auth.customer.id, auth.user.id, mode, "La demande n’a pas pu être envoyée.");
          send({ ok: false, error: "La demande n’a pas pu être envoyée." });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
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
