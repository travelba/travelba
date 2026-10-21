import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { parisTodayIso } from "@/lib/crm/dates";
import {
  hotelSearchAllowed,
  hotelSearchCacheKey,
  parseHotelSearchQuery,
  readHotelSearchCache,
  streamHotelSearch,
  toClientHotel,
  writeHotelSearchCache,
  type PricedStay,
} from "@/lib/crm/hotel-search";
import { loadLittleEmperorsOffers } from "@/lib/crm/little-emperors-search";
import { saveHotelOffer } from "@/lib/crm/hotel-search-store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelSearchAllowed(auth.customer)) return jsonError("Introuvable", 404);
  const body = await request.json().catch(() => null);
  const parsed = parseHotelSearchQuery(body, parisTodayIso());
  if (!parsed.ok) return jsonError(parsed.message, 400);
  const key = hotelSearchCacheKey(parsed.query);
  const cached = readHotelSearchCache(key);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const stays: PricedStay[] = [];
      const links: Promise<void>[] = [];
      try {
        const accounts = cached
          ? []
          : [
              () =>
                loadLittleEmperorsOffers({
                  destination: parsed.query.destination,
                  city: parsed.query.city,
                  checkIn: parsed.query.checkIn,
                  checkOut: parsed.query.checkOut,
                  rooms: parsed.query.rooms,
                  target: parsed.query.target,
                  fetchImpl: fetch,
                }),
            ];
        for await (const event of streamHotelSearch({ accounts, cached, timeoutMs: 9000 })) {
          if (event.type === "start") {
            send({ type: "start" });
            continue;
          }
          if (event.type === "hotel") {
            const index = stays.findIndex((row) => row.hotelKey === event.stay.hotelKey);
            if (index < 0) stays.push(event.stay);
            else stays[index] = event.stay;
            send({
              type: "hotel",
              replaced: event.replaced,
              hotel: toClientHotel(event.stay, parsed.nights, null),
            });
            links.push(
              saveHotelOffer(auth.customer.id, parsed.query, parsed.nights, event.stay).then((id) => {
                if (id) send({ type: "link", hotelKey: event.stay.hotelKey, offerId: id });
              })
            );
            continue;
          }
          await Promise.all(links);
          if (!event.cached) writeHotelSearchCache(key, stays);
          send({
            type: "done",
            tFirstMs: event.tFirstMs,
            tDoneMs: event.tDoneMs,
            cached: event.cached,
            count: event.count,
          });
        }
      } catch {
        send({ type: "error", message: "La recherche n’a pas abouti. Réessayez." });
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
}
