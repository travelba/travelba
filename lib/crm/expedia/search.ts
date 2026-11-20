import { foldHotelLabel } from "@/lib/crm/hotel-catalog";
import type { HotelRoomOccupancy } from "@/lib/crm/hotel-search";
import { eanGet, expediaFailureCode } from "./client";
import { parseExpediaContent, parseExpediaRegions, type ExpediaPropertyContent } from "./content-parse";
import { loadExpediaConfig, type ExpediaSalesChannel } from "./config";
import { normalizeExpediaProperty } from "./normalize";
import type { NormalizedRate } from "@/lib/crm/hotel-providers/types";

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
}) {
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
    timeoutMs: 8_000,
  });
  const regions = parseExpediaRegions(data).filter((region) => region.type === "city" || !region.type);
  if (!regions.length) return null;
  const needle = foldHotelLabel(input.place);
  const named = regions.find((region) => {
    const name = foldHotelLabel(region.name);
    return needle && (name === needle || name.includes(needle) || needle.includes(name));
  });
  return (named || regions[0]).id;
}

async function propertyContent(ids: string[], customerIp: string | null, signal?: AbortSignal, fetchImpl?: typeof fetch) {
  const limited = ids.slice(0, 40);
  if (!limited.length) return new Map<string, ExpediaPropertyContent>();
  const query = new URLSearchParams();
  query.set("language", "fr-FR");
  query.set("supply_source", "expedia");
  repeated(query, "property_id", limited);
  const { data } = await eanGet("/properties/content", query, {
    customerIp,
    signal,
    fetchImpl,
    timeoutMs: 10_000,
  });
  return new Map(parseExpediaContent(data).map((row) => [row.propertyId, row]));
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
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<NormalizedRate[]> {
  if (!input.coords) return [];
  const config = loadExpediaConfig();
  if (!config.apiKey || !config.sharedSecret) return [];
  const place = input.city || input.destination;
  const regionId = await cityRegionId({
    coords: input.coords,
    place,
    customerIp: input.customerIp,
    signal: input.signal,
    fetchImpl: input.fetchImpl,
  });
  if (!regionId) return [];
  const query = new URLSearchParams();
  query.set("checkin", input.checkIn);
  query.set("checkout", input.checkOut);
  query.set("currency", "EUR");
  query.set("country_code", "FR");
  query.set("language", "fr-FR");
  query.set("region_id", regionId);
  query.set("rate_plan_count", "4");
  query.set("sales_channel", input.salesChannel);
  query.set("sales_environment", "hotel_only");
  repeated(query, "occupancy", input.rooms.map(occupancyToken));
  repeated(query, "include", ["sale_scenario.mobile_promotion"]);
  const { data } = await eanGet("/properties/availability", query, {
    customerIp: input.customerIp,
    signal: input.signal,
    fetchImpl: input.fetchImpl,
    timeoutMs: 12_000,
  });
  const properties = Array.isArray(data) ? data : [];
  const ids = properties
    .map((row) => (row && typeof row === "object" ? (row as { property_id?: unknown }).property_id : null))
    .filter((id): id is string => typeof id === "string")
    .slice(0, 40);
  let content = new Map<string, ExpediaPropertyContent>();
  try {
    content = await propertyContent(ids, input.customerIp, input.signal, input.fetchImpl);
  } catch (err) {
    console.error("[expedia] contenu", expediaFailureCode(err));
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
