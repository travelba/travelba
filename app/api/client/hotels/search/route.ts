import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { parisTodayIso } from "@/lib/crm/dates";
import { hotelBookingEnabled } from "@/lib/crm/hotel-access";
import {
  hotelSearchCacheKey,
  parseHotelSearchQuery,
  readHotelSearchCache,
  streamHotelSearch,
  toClientHotel,
  writeHotelSearchCache,
  type PricedStay,
} from "@/lib/crm/hotel-search";
import { foldHotelLabel } from "@/lib/crm/hotel-catalog";
import { loadKnownHotelOffers, loadLittleEmperorsOffers } from "@/lib/crm/little-emperors-search";
import { saveHotelOffer } from "@/lib/crm/hotel-search-store";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

function catalogCity(destination: string, city: string) {
  const head = (city || destination).split(",")[0]?.trim() || "";
  if (foldHotelLabel(head) === "londres") return "London";
  return head;
}

async function knownHotelIds(destination: string, city: string) {
  const place = catalogCity(destination, city).replace(/[%_\\]/g, "");
  if (place.length < 2) return [];
  try {
    const db = createServiceClient();
    const { data } = await db.from("crm_le_hotels").select("le_hotel_id").ilike("city", place).limit(8);
    return (data || [])
      .map((row) => Number((row as { le_hotel_id?: unknown }).le_hotel_id))
      .filter((id) => Number.isInteger(id) && id > 0);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelBookingEnabled(auth.customer)) return jsonError("Introuvable", 404);
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
      let supplierFailed = false;
      try {
        const stay = {
          destination: parsed.query.destination,
          city: parsed.query.city,
          checkIn: parsed.query.checkIn,
          checkOut: parsed.query.checkOut,
          rooms: parsed.query.rooms,
        };
        const direct = () =>
          loadLittleEmperorsOffers({
            ...stay,
            target: parsed.query.target,
            fetchImpl: fetch,
          });
        const known =
          parsed.query.target?.kind === "hotel"
            ? []
            : [
                async () =>
                  loadKnownHotelOffers({
                    ...stay,
                    hotelIds: await knownHotelIds(parsed.query.destination, parsed.query.city),
                    fetchImpl: fetch,
                  }),
              ];
        const accounts = cached ? [] : [direct, ...known];
        for await (const event of streamHotelSearch({ accounts, cached, timeoutMs: 55_000 })) {
          if (event.type === "start") {
            send({ type: "start" });
            continue;
          }
          if (event.type === "supplier_error") {
            supplierFailed = true;
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
          if (supplierFailed && stays.length === 0) {
            send({ type: "error", message: "La recherche n’a pas abouti. Réessayez." });
            continue;
          }
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
