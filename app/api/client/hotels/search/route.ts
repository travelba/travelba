import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { parisTodayIso } from "@/lib/crm/dates";
import { hotelBookingEnabled } from "@/lib/crm/hotel-access";
import { hotelActivityMode, hotelFilterLabels } from "@/lib/crm/hotel-activity";
import { recordHotelClientActivity } from "@/lib/crm/hotel-activity-run";
import {
  deadline,
  hotelSearchCacheKey,
  parseHotelSearchQuery,
  readHotelSearchCache,
  streamHotelSearch,
  toClientHotel,
  writeHotelSearchCache,
  type PricedStay,
} from "@/lib/crm/hotel-search";
import { clientCompares, foldProviderRates } from "@/lib/crm/hotel-providers/aggregate";
import { rememberHotelMatches } from "@/lib/crm/hotel-providers/remember";
import { expediaFailureCode, expediaFailureText } from "@/lib/crm/expedia/client";
import { expediaSearchEnabled, resolveExpediaSalesChannel, safeExpediaConfig } from "@/lib/crm/expedia/config";
import { coordsForPlace } from "@/lib/crm/expedia/places";
import { EXPEDIA_SEARCH_BUDGET_MS, searchExpediaRates } from "@/lib/crm/expedia/search";
import type { NormalizedRate } from "@/lib/crm/hotel-providers/types";
import { foldHotelLabel } from "@/lib/crm/hotel-catalog";
import { attachHotelCover, loadKnownHotelOffers, loadLittleEmperorsOffers } from "@/lib/crm/little-emperors-search";
import { saveHotelOffer } from "@/lib/crm/hotel-search-store";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

function catalogCity(destination: string, city: string) {
  const head = (city || destination).split(",")[0]?.trim() || "";
  if (foldHotelLabel(head) === "londres") return "London";
  return head;
}

function mobileScreen(request: Request, body: unknown) {
  const screen = body && typeof body === "object" ? (body as { screen?: unknown }).screen : null;
  if (screen === "mobile") return true;
  if (screen === "desktop") return false;
  return /Mobile|Android|iPhone|iPad/i.test(request.headers.get("user-agent") || "");
}

function customerIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
  const first = forwarded.split(",")[0]?.trim() || "";
  if (!first || first.length > 64) return null;
  return first;
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
  const mode = hotelActivityMode(auth.customer);
  const filters = hotelFilterLabels(body && typeof body === "object" ? (body as { filters?: unknown }).filters : null);
  if (!parsed.ok) {
    const place = typeof body?.destination === "string" ? body.destination : "";
    await recordHotelClientActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      mode,
      gesture: { kind: "error", where: "recherche", message: parsed.message, place },
    });
    return jsonError(parsed.message, 400);
  }
  const key = hotelSearchCacheKey(parsed.query);
  const expediaOn = expediaSearchEnabled();
  const cached = expediaOn ? null : readHotelSearchCache(key);
  const catalogCoords = coordsForPlace(parsed.query.destination, parsed.query.city);
  const salesChannel = resolveExpediaSalesChannel({
    mode: safeExpediaConfig()?.salesChannelMode || "auto",
    audience: "client",
    mobile: mobileScreen(request, body),
  });
  const ip = customerIp(request);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const stays: PricedStay[] = [];
      const links: Promise<void>[] = [];
      const expediaTask =
        expediaOn && catalogCoords
          ? deadline(
              searchExpediaRates({
                destination: parsed.query.destination,
                city: parsed.query.city,
                checkIn: parsed.query.checkIn,
                checkOut: parsed.query.checkOut,
                rooms: parsed.query.rooms,
                salesChannel,
                customerIp: ip,
                coords: catalogCoords,
              }),
              EXPEDIA_SEARCH_BUDGET_MS + 2_000
            )
              .then((rates) => ({ rates, failed: false as const, code: "" }))
              .catch((err: unknown) => {
                const code = expediaFailureCode(err);
                console.error("[expedia] recherche", code);
                return { rates: [] as NormalizedRate[], failed: true as const, code };
              })
          : null;
      const covers: Promise<void>[] = [];
      let supplierFailed = false;
      let noted = false;
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
            covers.push(
              attachHotelCover(event.stay, fetch).then((covered) => {
                if (!covered.photoUrl || covered.photoUrl === event.stay.photoUrl) return;
                send({
                  type: "hotel",
                  replaced: true,
                  hotel: toClientHotel(covered, parsed.nights, null),
                });
              })
            );
            continue;
          }
          if (expediaOn) {
            let extra = expediaTask
              ? await expediaTask
              : { rates: [] as NormalizedRate[], failed: false, code: "" };
            if (!catalogCoords) {
              const coords = stays.find((stay) => stay.coords)?.coords ?? null;
              if (coords) {
                try {
                  extra = {
                    rates: await deadline(
                      searchExpediaRates({
                        destination: parsed.query.destination,
                        city: parsed.query.city,
                        checkIn: parsed.query.checkIn,
                        checkOut: parsed.query.checkOut,
                        rooms: parsed.query.rooms,
                        salesChannel,
                        customerIp: ip,
                        coords,
                      }),
                      EXPEDIA_SEARCH_BUDGET_MS + 2_000
                    ),
                    failed: false,
                    code: "",
                  };
                } catch (err) {
                  const code = expediaFailureCode(err);
                  console.error("[expedia] recherche", code);
                  extra = { rates: [], failed: true, code };
                }
              }
            }
            const folded = foldProviderRates({
              stays,
              expedia: extra.rates,
              nights: parsed.nights,
              audience: "client",
            });
            for (const update of folded.updates) {
              const stay = stays.find((row) => row.hotelKey === update.hotelKey);
              if (!stay) continue;
              send({
                type: "hotel",
                replaced: true,
                hotel: { ...toClientHotel(stay, parsed.nights, null), compares: clientCompares(update.compares) },
              });
            }
            for (const created of folded.created) {
              stays.push(created.stay);
              send({
                type: "hotel",
                replaced: false,
                hotel: { ...toClientHotel(created.stay, parsed.nights, null), compares: clientCompares(created.compares) },
              });
            }
            void rememberHotelMatches(folded.links);
            if (extra.failed && stays.length > 0) {
              send({
                type: "note",
                message: `${expediaFailureText(extra.code)} Les autres tarifs sont affichés.`,
              });
            }
            if (extra.failed && stays.length === 0) supplierFailed = true;
          }
          await Promise.all(links);
          if (supplierFailed && stays.length === 0) {
            send({ type: "error", message: "La recherche n’a pas abouti. Réessayez." });
            await recordHotelClientActivity({
              customerId: auth.customer.id,
              authUserId: auth.user.id,
              mode,
              gesture: {
                kind: "error",
                where: "recherche",
                message: "La recherche n’a pas abouti. Réessayez.",
                place: parsed.query.destination,
              },
            });
            noted = true;
            continue;
          }
          if (!event.cached && !expediaOn) writeHotelSearchCache(key, stays);
          await recordHotelClientActivity({
            customerId: auth.customer.id,
            authUserId: auth.user.id,
            mode,
            gesture: {
              kind: "search",
              destination: parsed.query.destination,
              checkIn: parsed.query.checkIn,
              checkOut: parsed.query.checkOut,
              rooms: parsed.query.rooms,
              count: event.count,
              filters,
            },
          });
          noted = true;
          send({
            type: "done",
            tFirstMs: event.tFirstMs,
            tDoneMs: event.tDoneMs,
            cached: event.cached,
            count: expediaOn ? stays.length : event.count,
          });
          await Promise.all(covers);
        }
      } catch {
        if (noted) return;
        send({ type: "error", message: "La recherche n’a pas abouti. Réessayez." });
        await recordHotelClientActivity({
          customerId: auth.customer.id,
          authUserId: auth.user.id,
          mode,
          gesture: {
            kind: "error",
            where: "recherche",
            message: "La recherche n’a pas abouti. Réessayez.",
            place: parsed.query.destination,
          },
        });
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
