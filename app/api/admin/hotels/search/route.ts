import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { parisTodayIso } from "@/lib/crm/dates";
import { expediaFailureCode, expediaFailureText } from "@/lib/crm/expedia/client";
import { expediaSearchEnabled, resolveExpediaSalesChannel, safeExpediaConfig } from "@/lib/crm/expedia/config";
import { coordsForPlace } from "@/lib/crm/expedia/places";
import { EXPEDIA_SEARCH_BUDGET_MS, searchExpediaRates } from "@/lib/crm/expedia/search";
import { foldProviderRates, type AgentCompareRate } from "@/lib/crm/hotel-providers/aggregate";
import { rememberHotelMatches } from "@/lib/crm/hotel-providers/remember";
import type { NormalizedRate } from "@/lib/crm/hotel-providers/types";
import { foldHotelLabel } from "@/lib/crm/hotel-catalog";
import {
  deadline,
  parseHotelSearchQuery,
  perNightCents,
  streamHotelSearch,
  type PricedStay,
} from "@/lib/crm/hotel-search";
import { loadKnownHotelOffers, loadLittleEmperorsOffers } from "@/lib/crm/little-emperors-search";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

function catalogCity(destination: string, city: string) {
  const head = (city || destination).split(",")[0]?.trim() || "";
  if (foldHotelLabel(head) === "londres") return "London";
  return head;
}

function mobileScreen(body: unknown) {
  const screen = body && typeof body === "object" ? (body as { screen?: unknown }).screen : null;
  return screen === "mobile";
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

function memberRate(stay: PricedStay, nights: number): AgentCompareRate {
  return {
    kind: "membre",
    provider: "little_emperors",
    label: "Little Emperors",
    sellCents: stay.sellCents,
    perNightCents: perNightCents(stay.sellCents, nights),
    currency: stay.currency,
    taxesCents: null,
    dueAtPropertyCents: null,
    cancellation: stay.cancellation || (stay.perks.freeCancellation ? "Annulation gratuite" : ""),
    refundable: stay.perks.freeCancellation,
    legalLines: [],
    bookable: true,
  };
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const parsed = parseHotelSearchQuery(body, parisTodayIso());
  if (!parsed.ok) return jsonError(parsed.message, 400);
  const expediaOn = expediaSearchEnabled();
  const catalogCoords = coordsForPlace(parsed.query.destination, parsed.query.city);
  const salesChannel = resolveExpediaSalesChannel({
    mode: safeExpediaConfig()?.salesChannelMode || "auto",
    audience: "agent",
    mobile: mobileScreen(body),
  });
  const ip = customerIp(request);
  const stay = {
    destination: parsed.query.destination,
    city: parsed.query.city,
    checkIn: parsed.query.checkIn,
    checkOut: parsed.query.checkOut,
    rooms: parsed.query.rooms,
  };
  const direct = () => loadLittleEmperorsOffers({ ...stay, target: parsed.query.target, fetchImpl: fetch });
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
  const expediaPromise =
    expediaOn && catalogCoords
      ? deadline(
          searchExpediaRates({
            ...stay,
            salesChannel,
            customerIp: ip,
            coords: catalogCoords,
          }),
          EXPEDIA_SEARCH_BUDGET_MS + 2_000
        )
          .then((rates) => ({ rates, failed: false, code: "" }))
          .catch((err: unknown) => {
            const code = expediaFailureCode(err);
            console.error("[expedia] recherche", code);
            return { rates: [] as NormalizedRate[], failed: true, code };
          })
      : null;
  const stays: PricedStay[] = [];
  let leFailed = false;
  for await (const event of streamHotelSearch({ accounts: [direct, ...known], cached: null, timeoutMs: 55_000 })) {
    if (event.type === "supplier_error") leFailed = true;
    if (event.type !== "hotel") continue;
    const index = stays.findIndex((row) => row.hotelKey === event.stay.hotelKey);
    if (index < 0) stays.push(event.stay);
    else stays[index] = event.stay;
  }
  let expediaFailed = false;
  let expediaCode = "";
  let expediaRates: NormalizedRate[] = [];
  if (expediaPromise) {
    const result = await expediaPromise;
    expediaRates = result.rates;
    expediaFailed = result.failed;
    expediaCode = result.code;
  } else if (expediaOn) {
    const coords = stays.find((row) => row.coords)?.coords || null;
    if (coords) {
      try {
        expediaRates = await deadline(
          searchExpediaRates({
            ...stay,
            salesChannel,
            customerIp: ip,
            coords,
          }),
          EXPEDIA_SEARCH_BUDGET_MS + 2_000
        );
      } catch (err) {
        expediaFailed = true;
        expediaCode = expediaFailureCode(err);
        console.error("[expedia] recherche", expediaCode);
      }
    }
  }
  const folded = foldProviderRates({
    stays,
    expedia: expediaRates,
    nights: parsed.nights,
    audience: "agent",
  });
  for (const created of folded.created) {
    if (stays.some((row) => row.hotelKey === created.stay.hotelKey)) continue;
    stays.push(created.stay);
  }
  void rememberHotelMatches(folded.links);
  const hotels = stays.map((row) => {
    const update = folded.updates.find((item) => item.hotelKey === row.hotelKey);
    const created = folded.created.find((item) => item.stay.hotelKey === row.hotelKey);
    return {
      hotelKey: row.hotelKey,
      name: row.hotelName,
      city: row.city,
      photo: row.photoUrl,
      stars: row.stars,
      sellCents: row.sellCents,
      currency: row.currency,
      benefits: row.benefits,
      compares: update?.compares || created?.compares || [memberRate(row, parsed.nights)],
    };
  });
  if (leFailed && hotels.length === 0 && (!expediaOn || expediaFailed || expediaRates.length === 0)) {
    return jsonError("La recherche n’a pas abouti. Réessayez.", 502);
  }
  return NextResponse.json({
    hotels,
    reviews: folded.reviews,
    sources: [
      { provider: "little_emperors", ok: !leFailed || stays.some((row) => row.account === "little_emperors") },
      {
        provider: "expedia",
        ok: expediaOn && !expediaFailed,
        message: expediaOn ? (expediaFailed ? expediaFailureText(expediaCode) : "") : "Expedia est désactivé.",
      },
    ],
  });
}
