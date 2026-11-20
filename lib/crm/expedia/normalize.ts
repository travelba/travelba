import { formatDateTimeFr } from "@/lib/crm/dates";
import type { HotelRoomOccupancy } from "@/lib/crm/hotel-search";
import { EXPEDIA_TAX_LEGAL_FR } from "./legal";
import { decimalStringToCents, sumCents } from "./money";
import type { ExpediaPropertyContent } from "./content-parse";
import type { NormalizedRate } from "@/lib/crm/hotel-providers/types";

type MoneyBag = { request_currency?: { value?: unknown; currency?: unknown } };

function requestMoney(bag: unknown): { cents: number; currency: string; text: string } | null {
  if (!bag || typeof bag !== "object") return null;
  const request = (bag as MoneyBag).request_currency;
  if (!request || typeof request.value !== "string") return null;
  const cents = decimalStringToCents(request.value);
  if (cents == null) return null;
  const currency = typeof request.currency === "string" && /^[A-Z]{3}$/.test(request.currency) ? request.currency : "EUR";
  return { cents, currency, text: request.value };
}

function occupancyToken(room: HotelRoomOccupancy) {
  const ages = room.children.map((child) => child.age).filter((age) => Number.isInteger(age) && age >= 0);
  ages.sort((a, b) => a - b);
  return ages.length ? `${room.adults}-${ages.join(",")}` : String(room.adults);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function nightlyTaxCents(pricing: Record<string, unknown>, rooms: number): number | null {
  const nights = pricing.nightly;
  if (!Array.isArray(nights)) return null;
  const parts: number[] = [];
  for (const night of nights) {
    if (!Array.isArray(night)) continue;
    for (const row of night) {
      const line = record(row);
      const type = typeof line?.type === "string" ? line.type : "";
      if (type !== "tax_and_service_fee" && type !== "property_fee") continue;
      const cents = typeof line?.value === "string" ? decimalStringToCents(line.value) : null;
      if (cents == null) return null;
      parts.push(cents * rooms);
    }
  }
  return sumCents(parts);
}

function dueAtPropertyCents(pricing: Record<string, unknown>, rooms: number): number | null {
  const fees = record(pricing.fees);
  if (!fees) return null;
  const parts: number[] = [];
  for (const key of ["mandatory_tax", "mandatory_fee", "resort_fee"]) {
    const money = requestMoney(fees[key]);
    if (!money) continue;
    parts.push(money.cents * rooms);
  }
  return sumCents(parts);
}

type PricedOccupancy = {
  cents: number;
  currency: string;
  text: string;
  baseCents: number | null;
  taxCents: number | null;
  dueCents: number | null;
  strikeCents: number | null;
};

function priceOccupancy(pricing: Record<string, unknown>, roomCount: number): PricedOccupancy | null {
  const totals = record(pricing.totals);
  const inclusive = requestMoney(totals?.inclusive);
  if (!inclusive || inclusive.cents <= 0) return null;
  const exclusive = requestMoney(totals?.exclusive);
  const strike = requestMoney(totals?.inclusive_strikethrough) || requestMoney(totals?.strikethrough);
  const taxFromNights = nightlyTaxCents(pricing, roomCount);
  const taxFromTotals =
    exclusive && inclusive.currency === exclusive.currency ? (inclusive.cents - exclusive.cents) * roomCount : null;
  return {
    cents: inclusive.cents * roomCount,
    currency: inclusive.currency,
    text: roomCount === 1 ? inclusive.text : "",
    baseCents: exclusive ? exclusive.cents * roomCount : null,
    taxCents: taxFromNights != null ? taxFromNights : taxFromTotals,
    dueCents: dueAtPropertyCents(pricing, roomCount),
    strikeCents: strike ? strike.cents * roomCount : null,
  };
}

function sumOccupancies(
  occupancyPricing: Record<string, unknown>,
  rooms: HotelRoomOccupancy[]
): PricedOccupancy | null {
  const counts = new Map<string, number>();
  for (const room of rooms) {
    const token = occupancyToken(room);
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  const parts: PricedOccupancy[] = [];
  for (const [token, count] of counts) {
    const pricing = record(occupancyPricing[token]);
    if (!pricing) return null;
    const priced = priceOccupancy(pricing, count);
    if (!priced) return null;
    parts.push(priced);
  }
  if (!parts.length) return null;
  const currency = parts[0].currency;
  if (parts.some((part) => part.currency !== currency)) return null;
  return {
    cents: parts.reduce((sum, part) => sum + part.cents, 0),
    currency,
    text: parts.length === 1 ? parts[0].text : "",
    baseCents: sumCents(parts.map((part) => part.baseCents)),
    taxCents: sumCents(parts.map((part) => part.taxCents)),
    dueCents: sumCents(parts.map((part) => part.dueCents)),
    strikeCents: sumCents(parts.map((part) => part.strikeCents)),
  };
}

function penaltyValue(row: Record<string, unknown>): { kind: "amount" | "nights" | "percent"; value: string; currency?: string } | null {
  if (typeof row.amount === "string" && decimalStringToCents(row.amount) != null) {
    return { kind: "amount", value: row.amount, currency: typeof row.currency === "string" ? row.currency : undefined };
  }
  if (typeof row.nights === "string" || typeof row.nights === "number") {
    return { kind: "nights", value: String(row.nights) };
  }
  if (typeof row.percent === "string" || typeof row.percent === "number") {
    return { kind: "percent", value: String(row.percent) };
  }
  return null;
}

function cancellationOf(rate: Record<string, unknown>, now: Date) {
  const refundable = rate.refundable === true;
  const raw = Array.isArray(rate.cancel_penalties) ? rate.cancel_penalties : [];
  const penalties: NormalizedRate["cancellation"]["penalties"] = [];
  for (const item of raw) {
    const row = record(item);
    if (!row) continue;
    const value = penaltyValue(row);
    const start = typeof row.start === "string" ? row.start : "";
    const end = typeof row.end === "string" ? row.end : "";
    if (!value || !start || !end) continue;
    penalties.push({ start, end, kind: value.kind, value: value.value, currency: value.currency });
  }
  const future = penalties
    .map((penalty) => penalty.start)
    .filter((start) => {
      const time = Date.parse(start);
      return Number.isFinite(time) && time > now.getTime();
    })
    .sort();
  const freeUntil = refundable && future[0] ? future[0] : null;
  const lines = penalties.map((penalty) => {
    const when = `${formatDateTimeFr(penalty.start)} – ${formatDateTimeFr(penalty.end)}`;
    if (penalty.kind === "amount") return `${penalty.value} ${penalty.currency || ""}`.trim() + ` (${when})`;
    if (penalty.kind === "nights") return `${penalty.value} nuit(s) (${when})`;
    return `${penalty.value} % (${when})`;
  });
  let text = "Non remboursable.";
  if (refundable && freeUntil) text = `Remboursable jusqu’au ${formatDateTimeFr(freeUntil)}.`;
  else if (refundable && !penalties.length) text = "Remboursable.";
  else if (refundable) text = "Remboursable selon les frais indiqués.";
  else if (penalties.length) text = "Non remboursable. Des frais s’appliquent.";
  if (lines.length) text = `${text} ${lines.join(" ")}`;
  return { refundable, freeUntil, penalties, text: text.slice(0, 400) };
}

function merchantOf(rate: Record<string, unknown>): "supplier" | "property" | "unknown" {
  const value = typeof rate.merchant_of_record === "string" ? rate.merchant_of_record : "";
  if (value === "expedia") return "supplier";
  if (value === "property") return "property";
  return "unknown";
}

function bestRate(property: Record<string, unknown>, rooms: HotelRoomOccupancy[], now: Date) {
  const roomRows = Array.isArray(property.rooms) ? property.rooms : [];
  let best: { cents: number; refundable: boolean; rate: Record<string, unknown>; roomName: string; price: PricedOccupancy } | null =
    null;
  for (const roomRow of roomRows) {
    const room = record(roomRow);
    if (!room) continue;
    const roomName = typeof room.room_name === "string" ? room.room_name : "";
    const rates = Array.isArray(room.rates) ? room.rates : [];
    for (const rateRow of rates) {
      const rate = record(rateRow);
      if (!rate || rate.status === "unavailable") continue;
      const pricing = record(rate.occupancy_pricing);
      if (!pricing) continue;
      const price = sumOccupancies(pricing, rooms);
      if (!price) continue;
      const refundable = rate.refundable === true;
      const better =
        !best ||
        price.cents < best.cents ||
        (price.cents === best.cents && refundable && !best.refundable);
      if (better) best = { cents: price.cents, refundable, rate, roomName, price };
    }
  }
  if (!best) return null;
  return { ...best, cancellation: cancellationOf(best.rate, now) };
}

export function normalizeExpediaProperty(input: {
  property: unknown;
  content: ExpediaPropertyContent | null;
  rooms: HotelRoomOccupancy[];
  now?: Date;
}): NormalizedRate | null {
  const property = record(input.property);
  const propertyId = typeof property?.property_id === "string" ? property.property_id : "";
  if (!property || !propertyId) return null;
  const picked = bestRate(property, input.rooms, input.now || new Date());
  if (!picked) return null;
  const content = input.content;
  const name = (content?.name || "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  const merchant = merchantOf(picked.rate);
  const due = picked.price.dueCents;
  const payNow = merchant === "property" ? 0 : picked.price.cents;
  const payLater = merchant === "property" ? picked.price.cents + (due || 0) : due || 0;
  const rateId = typeof picked.rate.id === "string" ? picked.rate.id : "";
  return {
    provider: "expedia",
    providerHotelId: propertyId,
    providerRateToken: { propertyId, rateId },
    hotel: {
      name,
      city: content?.city || "",
      country: content?.countryCode || undefined,
      stars: content?.stars ?? null,
      coords: content?.lat != null && content?.lng != null ? { lat: content.lat, lng: content.lng } : null,
      address: content?.address || null,
    },
    room: { label: picked.roomName, images: content?.image ? [content.image] : [] },
    currency: picked.price.currency,
    price: {
      totalInclusiveCents: picked.price.cents,
      totalInclusive: picked.price.text || undefined,
      currency: picked.price.currency,
      baseRateCents: picked.price.baseCents,
      taxesAndServiceFeesCents: picked.price.taxCents,
      dueAtPropertyCents: due,
      strikethroughCents: picked.price.strikeCents,
      payNowCents: payNow,
      payLaterCents: payLater,
    },
    agency: {
      supplierCostCents: null,
      commissionPct: null,
      commissionCents: null,
      markupCents: 0,
      discountCents: 0,
      earningCents: null,
      earningKind: "commission",
    },
    cancellation: picked.cancellation,
    payment: {
      collect: merchant === "property" ? "property" : "supplier",
      merchantOfRecord: merchant,
      needsCard: true,
    },
    perks: [],
    legalLines: [EXPEDIA_TAX_LEGAL_FR],
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}
