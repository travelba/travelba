import { foldHotelLabel } from "@/lib/crm/hotel-catalog";
import { hotelNameScore } from "@/lib/crm/hotel-providers/matching";
import type { HotelRoomOccupancy } from "@/lib/crm/hotel-search";
import { eanGet, expediaFailureCode } from "./client";
import { parseExpediaContent, parseExpediaRegions, type ExpediaPropertyContent } from "./content-parse";
import { loadExpediaConfig, type ExpediaSalesChannel } from "./config";
import { normalizeExpediaProperty } from "./normalize";
import type { NormalizedRate } from "@/lib/crm/hotel-providers/types";

/** Région, disponibilités, puis contenu. 12 s coupait l’appel avant la réponse de test.ean.com. */
export const EXPEDIA_SEARCH_BUDGET_MS = 32_000;

/** Plafond Rapid : au-delà, l’appel est refusé. */
export const EXPEDIA_PROPERTY_BATCH = 250;

type RegionHit = { id: string; propertyIds: string[] };

const regionCache = new Map<string, RegionHit>();

export function chunkPropertyIds(ids: string[], size = EXPEDIA_PROPERTY_BATCH) {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  const chunks: string[][] = [];
  const step = Math.max(1, size);
  for (let index = 0; index < unique.length; index += step) chunks.push(unique.slice(index, index + step));
  return chunks;
}

function occupancyToken(room: HotelRoomOccupancy) {
  const ages = room.children.map((child) => child.age).filter((age) => Number.isInteger(age) && age >= 0);
  ages.sort((a, b) => a - b);
  return ages.length ? `${room.adults}-${ages.join(",")}` : String(room.adults);
}

function repeated(query: URLSearchParams, key: string, values: string[]) {
  for (const value of values) query.append(key, value);
}

async function cityRegionId(input: {
  coords: { lat: number; lng: number };
  place: string;
  customerIp: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs: number;
}) {
  const cacheKey = `${input.coords.lat.toFixed(2)}|${input.coords.lng.toFixed(2)}|${foldHotelLabel(input.place)}`;
  const cached = regionCache.get(cacheKey);
  if (cached) return cached;
  const query = new URLSearchParams();
  repeated(query, "include", ["details"]);
  query.set("language", "fr-FR");
  query.set("supply_source", "expedia");
  query.set("type", "city");
  query.set("limit", "5");
  query.set("area", `25,${input.coords.lat.toFixed(5)},${input.coords.lng.toFixed(5)}`);
  const { data } = await eanGet("/regions", query, {
    customerIp: input.customerIp,
    signal: input.signal,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
  });
  const regions = parseExpediaRegions(data).filter((region) => region.type === "city" || !region.type);
  if (!regions.length) return null;
  const needle = foldHotelLabel(input.place);
  const named = regions.find((region) => {
    const name = foldHotelLabel(region.name);
    return needle && (name === needle || name.includes(needle) || needle.includes(name));
  });
  const picked = named || regions[0];
  const detail = new URLSearchParams();
  detail.set("language", "fr-FR");
  detail.set("include", "property_ids");
  const { data: full } = await eanGet(`/regions/${picked.id}`, detail, {
    customerIp: input.customerIp,
    signal: input.signal,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
  });
  const detailed = parseExpediaRegions(full).find((region) => region.id === picked.id) || parseExpediaRegions(full)[0];
  const hit = { id: picked.id, propertyIds: detailed?.propertyIds.length ? detailed.propertyIds : picked.propertyIds };
  if (!hit.propertyIds.length && full && typeof full === "object") {
    const raw = (full as { property_ids?: unknown }).property_ids;
    const kind = Array.isArray(raw) ? `array:${raw.length}:${typeof raw[0]}` : typeof raw;
    console.error("[expedia] region", hit.id, "sans property_id", kind);
  }
  regionCache.set(cacheKey, hit);
  return hit;
}

async function propertyContent(
  ids: string[],
  customerIp: string | null,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch | undefined,
  timeoutMs: number,
) {
  const content = new Map<string, ExpediaPropertyContent>();
  const batches = chunkPropertyIds(ids).slice(0, 1);
  for (const batch of batches) {
    const query = new URLSearchParams();
    query.set("language", "fr-FR");
    query.set("supply_source", "expedia");
    repeated(query, "property_id", batch);
    const { data } = await eanGet("/properties/content", query, {
      customerIp,
      signal,
      fetchImpl,
      timeoutMs,
    });
    for (const row of parseExpediaContent(data)) content.set(row.propertyId, row);
  }
  return content;
}

export function prefetchExpediaRegion(input: {
  coords: { lat: number; lng: number };
  place: string;
  customerIp: string | null;
  fetchImpl?: typeof fetch;
}) {
  void cityRegionId({ ...input, timeoutMs: 8_000 }).catch((err) => {
    console.error("[expedia] region", expediaFailureCode(err));
  });
}

export async function searchExpediaRates(input: {
  destination: string;
  city: string;
  checkIn: string;
  checkOut: string;
  rooms: HotelRoomOccupancy[];
  salesChannel: ExpediaSalesChannel;
  customerIp: string | null;
  coords: { lat: number; lng: number } | null;
  preferNames?: string[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<NormalizedRate[]> {
  if (!input.coords) return [];
  const config = loadExpediaConfig();
  if (!config.apiKey || !config.sharedSecret) return [];
  const started = Date.now();
  const left = () => Math.max(1_000, EXPEDIA_SEARCH_BUDGET_MS - (Date.now() - started));
  const place = input.city || input.destination;
  const region = await cityRegionId({
    coords: input.coords,
    place,
    customerIp: input.customerIp,
    signal: input.signal,
    fetchImpl: input.fetchImpl,
    timeoutMs: Math.min(8_000, left()),
  });
  if (!region || !region.propertyIds.length) return [];
  const prefer = (input.preferNames || []).map((name) => name.trim()).filter(Boolean);
  let selected = region.propertyIds.slice(0, EXPEDIA_PROPERTY_BATCH);
  let content = new Map<string, ExpediaPropertyContent>();
  if (prefer.length) {
    const matched: string[] = [];
    for (const batch of chunkPropertyIds(region.propertyIds).slice(0, 3)) {
      if (left() < 7_000 && matched.length) break;
      try {
        const batchContent = await propertyContent(batch, input.customerIp, input.signal, input.fetchImpl, Math.min(8_000, left()));
        for (const [id, row] of batchContent) {
          content.set(id, row);
          const score = prefer.reduce((best, name) => Math.max(best, hotelNameScore(name, row.name, place)), 0);
          if (score >= 0.72) matched.push(id);
        }
      } catch (err) {
        console.error("[expedia] contenu", expediaFailureCode(err));
        break;
      }
      if (matched.length >= 8) break;
    }
    if (matched.length) selected = matched.slice(0, EXPEDIA_PROPERTY_BATCH);
  }
  const query = new URLSearchParams();
  query.set("checkin", input.checkIn);
  query.set("checkout", input.checkOut);
  query.set("currency", "EUR");
  query.set("country_code", "FR");
  query.set("language", "fr-FR");
  query.set("rate_plan_count", "1");
  query.set("sales_channel", input.salesChannel);
  query.set("sales_environment", "hotel_only");
  repeated(query, "occupancy", input.rooms.map(occupancyToken));
  repeated(query, "property_id", selected);
  const { data } = await eanGet("/properties/availability", query, {
    customerIp: input.customerIp,
    signal: input.signal,
    fetchImpl: input.fetchImpl,
    timeoutMs: Math.min(12_000, Math.max(4_000, left() - 2_000)),
  });
  const properties = Array.isArray(data) ? data : [];
  const missing = properties
    .map((row) => (row && typeof row === "object" ? (row as { property_id?: unknown }).property_id : null))
    .filter((id): id is string => typeof id === "string" && !content.has(id));
  if (missing.length) {
    try {
      const extra = await propertyContent(missing, input.customerIp, input.signal, input.fetchImpl, Math.min(8_000, left()));
      for (const [id, row] of extra) content.set(id, row);
    } catch (err) {
      console.error("[expedia] contenu", expediaFailureCode(err));
    }
  }
  const rates: NormalizedRate[] = [];
  for (const property of properties) {
    const id = property && typeof property === "object" ? String((property as { property_id?: unknown }).property_id || "") : "";
    const rate = normalizeExpediaProperty({
      property,
      content: content.get(id) || null,
      rooms: input.rooms,
    });
    if (rate) rates.push(rate);
  }
  return rates;
}
