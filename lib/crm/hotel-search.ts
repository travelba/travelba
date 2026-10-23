import { priceAccommodation } from "./concierge-pricing";
import { foldHotelLabel } from "./hotel-catalog";
import { addIsoDays, isValidIsoDate } from "./dates";
import { frenchCancellation, frenchCity, frenchHotelLine, frenchHotelProse } from "./hotel-fr";
import { frenchLeBenefitLine } from "./ingest-parse";
import { amountToCents } from "./money";

/**
 * Recherche hôtel de l’espace client.
 * Un seul prix par hôtel : le moins cher, puis le plus d’avantages.
 * Little Emperors : le montant qu’ils demandent pour réserver (`total_to_book`),
 * jamais un net majoré. Les autres comptes : marge d’au moins 12 % du net
 * (`priceAccommodation`). Le client ne reçoit ni net, ni compte, ni commission.
 */

export const HOTEL_SEARCH_BENJAMIN_USER_ID = "c4d75f7e-c79f-438c-b797-7b234e37b6d0";
export const HOTEL_SEARCH_BENJAMIN_CUSTOMER_ID = "07b9dde3-de59-4b1a-88b7-03a6e23e98a6";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const EMPTY_TTL_MS = 20 * 1000;
const SUGGEST_TTL_MS = 10 * 60 * 1000;
const BRAND = /little emperors|expedia|ratehawk|amadeus|\btaap\b/i;

export const HOTEL_PERK_WEIGHTS = {
  breakfast: 8,
  freeCancellation: 6,
  upgrade: 5,
  credit: 4,
  earlyCheckIn: 2,
  lateCheckOut: 2,
  other: 1,
} as const;

export const HOTEL_OTHER_PERK_CAP = 3;

const BREAKFAST = /petit[-\s]?d[eé]jeuner|breakfast/i;
const CANCEL = /annulation gratuite|free cancellation|free cancel|remboursable/i;
const UPGRADE = /surclassement|upgrade/i;
const CREDIT = /cr[eé]dit|hotel credit/i;
const EARLY = /enregistrement anticip[eé]|arriv[eé]e anticip[eé]e|early check-?\s?in/i;
const LATE = /d[eé]part tardif|late check-?\s?out/i;

export type HotelAccountId = "little_emperors" | "net";

export type HotelPerks = {
  breakfast: boolean;
  freeCancellation: boolean;
  upgrade: boolean;
  credit: boolean;
  earlyCheckIn: boolean;
  lateCheckOut: boolean;
};

export type HotelOffer = {
  account: HotelAccountId;
  hotelName: string;
  city: string;
  roomLabel?: string | null;
  photoUrl?: string | null;
  thumbUrl?: string | null;
  currency?: string | null;
  benefits?: string[];
  freeCancellation?: boolean;
  /** Montant proposé par Little Emperors pour réserver. Ignoré sur un compte net. */
  proposed?: number | null;
  /** Net fournisseur. Ignoré pour Little Emperors, même s’il est présent. */
  net?: number | null;
  commissionable?: boolean;
  hotelCommission?: number | null;
  hotelId?: number | null;
  description?: string;
  images?: string[];
  coords?: { lat: number; lng: number } | null;
  footnotes?: string[];
  roomKey?: string;
  rateKey?: string;
  rateTitle?: string;
  cancellation?: string;
};

export type PricedStay = {
  hotelKey: string;
  hotelName: string;
  city: string;
  roomLabel: string | null;
  photoUrl: string | null;
  thumbUrl: string | null;
  sellCents: number;
  currency: string;
  benefits: string[];
  perks: HotelPerks;
  score: number;
  account: HotelAccountId;
  hotelId: number | null;
  description: string;
  images: string[];
  coords: { lat: number; lng: number } | null;
  footnotes: string[];
  roomKey: string;
  rateKey: string;
  rateTitle: string;
  cancellation: string;
};

export type ClientHotel = {
  offerId: string | null;
  hotelKey: string;
  name: string;
  city: string;
  room: string | null;
  photo: string | null;
  thumb: string | null;
  sellCents: number;
  perNightCents: number;
  currency: string;
  nights: number;
  benefits: string[];
  perks: HotelPerks;
  hotelId: number | null;
  description: string;
  images: string[];
  coords: { lat: number; lng: number } | null;
  footnotes: string[];
};

export type HotelChild = { age: number };

export type HotelRoomOccupancy = {
  adults: number;
  children: HotelChild[];
};

/** Cible choisie dans l’autocomplétion. Un hôtel part sur cet hôtel, pas sur la ville. */
export type HotelSearchTarget = {
  kind: "ville" | "hotel";
  id: number;
};

export type HotelSearchQuery = {
  destination: string;
  city: string;
  checkIn: string;
  checkOut: string;
  rooms: HotelRoomOccupancy[];
  target: HotelSearchTarget | null;
};

export type PlaceSuggestion = {
  label: string;
  kind: "ville" | "hotel";
  detail: string;
  id?: number | null;
};

export const HOTEL_MAX_ROOMS = 4;
export const HOTEL_MAX_ADULTS = 6;
export const HOTEL_MAX_CHILDREN = 4;

export type HotelStreamEvent =
  | { type: "start" }
  | { type: "hotel"; stay: PricedStay; replaced: boolean }
  | { type: "supplier_error" }
  | { type: "done"; tFirstMs: number | null; tDoneMs: number; cached: boolean; count: number };

type PerkKey = keyof HotelPerks;

const searchCache = new Map<string, { at: number; stays: PricedStay[] }>();
const suggestCache = new Map<string, { at: number; items: PlaceSuggestion[] }>();

export function hotelSearchAllowIds(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!Object.prototype.hasOwnProperty.call(env, "HOTEL_SEARCH_ALLOWLIST")) {
    return [HOTEL_SEARCH_BENJAMIN_USER_ID, HOTEL_SEARCH_BENJAMIN_CUSTOMER_ID];
  }
  return String(env.HOTEL_SEARCH_ALLOWLIST || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => UUID.test(part));
}

export function hotelSearchAllowed(
  customer: { id: string; auth_user_id?: string | null },
  env: NodeJS.ProcessEnv = process.env
) {
  const ids = new Set(hotelSearchAllowIds(env));
  if (ids.has(customer.id.toLowerCase())) return true;
  const auth = customer.auth_user_id?.toLowerCase();
  return Boolean(auth && ids.has(auth));
}

export function clearHotelSearchCache() {
  searchCache.clear();
  suggestCache.clear();
}

export function occupancyKey(rooms: HotelRoomOccupancy[]) {
  return rooms.map((room) => `${room.adults}:${room.children.map((child) => child.age).join(".")}`).join("/");
}

export function hotelSearchCacheKey(query: HotelSearchQuery) {
  const target = query.target ? `${query.target.kind}:${query.target.id}` : "";
  return [foldHotelLabel(query.destination), query.checkIn, query.checkOut, occupancyKey(query.rooms), target].join("|");
}

/** Même occupation pour chaque compte fournisseur. Little Emperors lit `children[].age`. */
export function supplierRoomOccupancy(rooms: HotelRoomOccupancy[]) {
  return rooms.map((room) => ({
    adults: room.adults,
    children: room.children.map((child) => ({ age: child.age })),
  }));
}

export function stayPartyLabel(rooms: HotelRoomOccupancy[]) {
  const roomCount = rooms.length;
  const adults = rooms.reduce((sum, room) => sum + room.adults, 0);
  const children = rooms.reduce((sum, room) => sum + room.children.length, 0);
  const roomWord = roomCount > 1 ? `${roomCount} chambres` : "1 chambre";
  const adultWord = adults > 1 ? `${adults} adultes` : "1 adulte";
  const childWord = children > 1 ? `${children} enfants` : children === 1 ? "1 enfant" : "";
  return [roomWord, adultWord, childWord].filter(Boolean).join(", ");
}

export function readHotelSearchCache(key: string, now = Date.now()): PricedStay[] | null {
  const row = searchCache.get(key);
  if (!row) return null;
  const ttl = row.stays.length ? SEARCH_TTL_MS : EMPTY_TTL_MS;
  if (now - row.at > ttl) {
    searchCache.delete(key);
    return null;
  }
  return row.stays;
}

export function writeHotelSearchCache(key: string, stays: PricedStay[], now = Date.now()) {
  searchCache.set(key, { at: now, stays });
  trimCache(searchCache);
}

export function readSuggestCache(key: string, now = Date.now()): PlaceSuggestion[] | null {
  const row = suggestCache.get(key);
  if (!row) return null;
  if (now - row.at > SUGGEST_TTL_MS) {
    suggestCache.delete(key);
    return null;
  }
  return row.items;
}

export function writeSuggestCache(key: string, items: PlaceSuggestion[], now = Date.now()) {
  suggestCache.set(key, { at: now, items });
  trimCache(suggestCache);
}

function trimCache(cache: Map<string, { at: number }>) {
  if (cache.size <= 40) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
  if (oldest) cache.delete(oldest[0]);
}

export function suggestQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[%_\\(),]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length < 2 || clean.length > 60) return null;
  return clean;
}

function childAge(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (value && typeof value === "object" && "age" in value) {
    const age = Number((value as { age?: unknown }).age);
    return Number.isInteger(age) ? age : null;
  }
  return null;
}

export function parseStayRooms(value: unknown): HotelRoomOccupancy[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > HOTEL_MAX_ROOMS) return null;
  const rooms: HotelRoomOccupancy[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const adults = Number((row as { adults?: unknown }).adults);
    if (!Number.isInteger(adults) || adults < 1 || adults > HOTEL_MAX_ADULTS) return null;
    const rawChildren = (row as { children?: unknown }).children;
    const list = rawChildren == null ? [] : Array.isArray(rawChildren) ? rawChildren : null;
    if (!list || list.length > HOTEL_MAX_CHILDREN) return null;
    const children: HotelChild[] = [];
    for (const child of list) {
      const age = childAge(child);
      if (age == null || age < 0 || age > 17) return null;
      children.push({ age });
    }
    rooms.push({ adults, children });
  }
  return rooms;
}

function parseSearchTarget(value: unknown): HotelSearchTarget | null {
  if (!value || typeof value !== "object") return null;
  const kind = (value as { kind?: unknown }).kind;
  const id = Number((value as { id?: unknown }).id);
  if ((kind !== "ville" && kind !== "hotel") || !Number.isInteger(id) || id < 1) return null;
  return { kind, id };
}

export function parseHotelSearchQuery(
  input: unknown,
  today: string
): { ok: true; query: HotelSearchQuery; nights: number } | { ok: false; message: string } {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const destination = typeof body.destination === "string" ? body.destination.replace(/\s+/g, " ").trim() : "";
  const city = typeof body.city === "string" ? body.city.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const checkIn = typeof body.checkIn === "string" ? body.checkIn.trim() : "";
  const checkOut = typeof body.checkOut === "string" ? body.checkOut.trim() : "";
  const rooms = Array.isArray(body.rooms)
    ? parseStayRooms(body.rooms)
    : parseStayRooms([{ adults: Number(body.adults), children: [] }]);
  if (destination.length < 2 || destination.length > 80) {
    return { ok: false, message: "Indiquez une destination ou un hôtel." };
  }
  if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut)) {
    return { ok: false, message: "Indiquez les dates du séjour." };
  }
  if (checkIn < today) return { ok: false, message: "L’arrivée ne peut pas être passée." };
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return { ok: false, message: "Le départ suit l’arrivée." };
  if (nights > 30) return { ok: false, message: "La recherche couvre trente nuits au plus." };
  if (!rooms) return { ok: false, message: "Indiquez les chambres, les adultes et l’âge de chaque enfant." };
  return { ok: true, query: { destination, city, checkIn, checkOut, rooms, target: parseSearchTarget(body.target) }, nights };
}

export function roomsFromStored(value: unknown, adults: number): HotelRoomOccupancy[] {
  const parsed = parseStayRooms(value);
  if (parsed) return parsed;
  const count = Number.isInteger(adults) && adults >= 1 ? Math.min(adults, HOTEL_MAX_ADULTS) : 2;
  return [{ adults: count, children: [] }];
}

export function nightsBetween(checkIn: string, checkOut: string) {
  const start = Date.parse(`${checkIn}T12:00:00Z`);
  const end = Date.parse(`${checkOut}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/** Vendredi le plus proche, au moins quatorze jours après aujourd’hui, pour deux nuits. */
export function defaultHotelStay(today: string) {
  const earliest = addIsoDays(today, 14);
  const dow = new Date(`${earliest}T00:00:00Z`).getUTCDay();
  const checkIn = addIsoDays(earliest, (5 - dow + 7) % 7);
  return { checkIn, checkOut: addIsoDays(checkIn, 2) };
}

export type HotelSearchDraftRoom = { adults: number; children: number[] };

export type HotelSearchDraft = {
  destination: string;
  city: string;
  checkIn: string;
  checkOut: string;
  rooms: HotelSearchDraftRoom[];
  target: HotelSearchTarget | null;
};

const DEFAULT_DRAFT_ROOMS: HotelSearchDraftRoom[] = [{ adults: 2, children: [] }];

function draftTarget(value: unknown): HotelSearchTarget | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { kind?: unknown; id?: unknown };
  const id = typeof row.id === "number" ? row.id : Number(row.id);
  if ((row.kind !== "ville" && row.kind !== "hotel") || !Number.isInteger(id) || id <= 0) return null;
  return { kind: row.kind, id };
}

function draftRooms(value: unknown): HotelSearchDraftRoom[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null;
  const rooms: HotelSearchDraftRoom[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const adults = Number((row as { adults?: unknown }).adults);
    if (!Number.isInteger(adults) || adults < 1 || adults > 6) return null;
    const rawChildren = (row as { children?: unknown }).children;
    if (!Array.isArray(rawChildren) || rawChildren.length > 4) return null;
    const children: number[] = [];
    for (const child of rawChildren) {
      const age = typeof child === "number" ? child : Number((child as { age?: unknown })?.age);
      if (!Number.isInteger(age) || age < 0 || age > 17) return null;
      children.push(age);
    }
    rooms.push({ adults, children });
  }
  return rooms;
}

/** Relit la dernière recherche enregistrée sur l’appareil. Les dates passées ne sont pas reprises. */
export function parseHotelSearchDraft(value: unknown): HotelSearchDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.destination !== "string" || typeof row.checkIn !== "string" || typeof row.checkOut !== "string") return null;
  const checkIn = row.checkIn.slice(0, 10);
  const checkOut = row.checkOut.slice(0, 10);
  if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut)) return null;
  return {
    destination: row.destination,
    city: typeof row.city === "string" ? row.city : "",
    checkIn,
    checkOut,
    rooms: draftRooms(row.rooms) ?? DEFAULT_DRAFT_ROOMS.map((room) => ({ ...room, children: [] })),
    target: draftTarget(row.target),
  };
}

export function hotelSearchDraft(today: string, saved: HotelSearchDraft | null): HotelSearchDraft {
  const dates = defaultHotelStay(today);
  const blank: HotelSearchDraft = {
    destination: "",
    city: "",
    checkIn: dates.checkIn,
    checkOut: dates.checkOut,
    rooms: DEFAULT_DRAFT_ROOMS.map((room) => ({ ...room, children: [] })),
    target: null,
  };
  if (!saved) return blank;
  const nights = nightsBetween(saved.checkIn, saved.checkOut);
  const datesOk = saved.checkIn >= today && nights >= 1 && nights <= 30;
  return {
    destination: saved.destination.replace(/\s+/g, " ").trim().slice(0, 80),
    city: saved.city.replace(/\s+/g, " ").trim().slice(0, 80),
    checkIn: datesOk ? saved.checkIn : dates.checkIn,
    checkOut: datesOk ? saved.checkOut : dates.checkOut,
    rooms: saved.rooms.length ? saved.rooms : blank.rooms,
    target: saved.target,
  };
}

export function perNightCents(sellCents: number, nights: number) {
  return Math.round(sellCents / Math.max(1, nights));
}

export function safeHotelPhoto(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function stayHotelKey(name: string, city: string) {
  return `${foldHotelLabel(name)}|${foldHotelLabel(city)}`;
}

function currencyOf(value: string | null | undefined) {
  const code = (value || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

function emptyPerks(): HotelPerks {
  return {
    breakfast: false,
    freeCancellation: false,
    upgrade: false,
    credit: false,
    earlyCheckIn: false,
    lateCheckOut: false,
  };
}

function classesOf(line: string): Array<PerkKey | "other"> {
  const hits: Array<PerkKey | "other"> = [];
  if (BREAKFAST.test(line)) hits.push("breakfast");
  if (CANCEL.test(line)) hits.push("freeCancellation");
  if (UPGRADE.test(line)) hits.push("upgrade");
  if (CREDIT.test(line)) hits.push("credit");
  if (EARLY.test(line)) hits.push("earlyCheckIn");
  if (LATE.test(line)) hits.push("lateCheckOut");
  return hits.length ? hits : ["other"];
}

export function scoreStay(input: { benefits: string[]; freeCancellation?: boolean }) {
  const perks = emptyPerks();
  let other = 0;
  let score = 0;
  for (const line of input.benefits) {
    for (const kind of classesOf(line)) {
      if (kind === "other") {
        if (other < HOTEL_OTHER_PERK_CAP) {
          other += 1;
          score += HOTEL_PERK_WEIGHTS.other;
        }
        continue;
      }
      if (perks[kind]) continue;
      perks[kind] = true;
      score += HOTEL_PERK_WEIGHTS[kind];
    }
  }
  if (input.freeCancellation && !perks.freeCancellation) {
    perks.freeCancellation = true;
    score += HOTEL_PERK_WEIGHTS.freeCancellation;
  }
  return { score, perks };
}

export function visibleBenefits(lines: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || line.length > 160 || BRAND.test(line)) continue;
    const key = foldHotelLabel(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function clientBenefits(lines: string[]) {
  return visibleBenefits(visibleBenefits(lines).map((line) => frenchHotelLine(frenchLeBenefitLine(line))));
}

function sellCentsFor(offer: HotelOffer): { sellCents: number; currency: string } | null {
  const currency = currencyOf(offer.currency);
  if (offer.account === "little_emperors") {
    const proposed = Number(offer.proposed);
    if (!(proposed > 0) || !Number.isFinite(proposed)) return null;
    const sellCents = amountToCents(proposed);
    return sellCents > 0 ? { sellCents, currency } : null;
  }
  const net = Number(offer.net);
  if (!(net > 0) || !Number.isFinite(net)) return null;
  const priced = priceAccommodation({
    net,
    currency,
    commissionable: Boolean(offer.commissionable),
    hotelCommission: offer.hotelCommission,
  });
  if (!priced) return null;
  const sellCents = amountToCents(priced.sell);
  return sellCents > 0 ? { sellCents, currency: priced.currency } : null;
}

export function priceStayOffer(offer: HotelOffer): PricedStay | null {
  const name = offer.hotelName.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const money = sellCentsFor(offer);
  if (!money) return null;
  const city = frenchCity(offer.city);
  const benefits = clientBenefits(offer.benefits || []).slice(0, 8);
  const { score, perks } = scoreStay({ benefits, freeCancellation: Boolean(offer.freeCancellation) });
  const room = frenchHotelLine(publicHotelText(offer.roomLabel || ""));
  const images = (offer.images || []).map((url) => safeHotelPhoto(url)).filter((url): url is string => Boolean(url)).slice(0, 12);
  const coords = offer.coords && Math.abs(offer.coords.lat) <= 90 && Math.abs(offer.coords.lng) <= 180 ? offer.coords : null;
  return {
    hotelKey: stayHotelKey(name, city),
    hotelName: name,
    city,
    roomLabel: room ? room.slice(0, 120) : null,
    photoUrl: safeHotelPhoto(offer.photoUrl) || images[0] || null,
    thumbUrl: safeHotelPhoto(offer.thumbUrl),
    sellCents: money.sellCents,
    currency: money.currency,
    benefits,
    perks,
    score,
    account: offer.account,
    hotelId: typeof offer.hotelId === "number" && offer.hotelId > 0 ? offer.hotelId : null,
    description: frenchHotelProse(publicHotelText(offer.description || "")).slice(0, 1600),
    images,
    coords,
    footnotes: clientBenefits(offer.footnotes || []).slice(0, 4),
    roomKey: (offer.roomKey || "").slice(0, 60),
    rateKey: (offer.rateKey || "").slice(0, 80),
    rateTitle: frenchHotelLine(publicHotelText(offer.rateTitle || "")).slice(0, 120),
    cancellation: frenchCancellation(publicHotelText(offer.cancellation || "")).slice(0, 400),
  };
}

export function publicHotelText(value: string) {
  return value.replace(BRAND, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function fillStay(base: PricedStay, extra: PricedStay): PricedStay {
  return {
    ...base,
    hotelId: base.hotelId ?? extra.hotelId,
    description: base.description || extra.description,
    images: base.images.length ? base.images : extra.images,
    coords: base.coords ?? extra.coords,
    photoUrl: base.photoUrl || extra.photoUrl,
    thumbUrl: base.thumbUrl || extra.thumbUrl,
    footnotes: base.footnotes.length ? base.footnotes : extra.footnotes,
    roomKey: base.roomKey || extra.roomKey,
    rateKey: base.rateKey || extra.rateKey,
    rateTitle: base.rateTitle || extra.rateTitle,
    cancellation: base.cancellation || extra.cancellation,
  };
}

/** Deux prix dans cet écart comptent pour le même : on garde alors le plus d’avantages. */
export const OFFER_PRICE_TIE_CENTS = 100;

export function offerBeats(
  current: { sellCents: number; currency: string; score: number; benefits: readonly string[] },
  next: { sellCents: number; currency: string; score: number; benefits: readonly string[] },
) {
  if (current.currency !== next.currency) return next.currency === "EUR" && current.currency !== "EUR";
  if (Math.abs(next.sellCents - current.sellCents) > OFFER_PRICE_TIE_CENTS) return next.sellCents < current.sellCents;
  if (next.score !== current.score) return next.score > current.score;
  if (next.benefits.length !== current.benefits.length) return next.benefits.length > current.benefits.length;
  return next.sellCents < current.sellCents;
}

function replaces(current: PricedStay, next: PricedStay) {
  return offerBeats(current, next);
}

export function mergeOffers(state: Map<string, PricedStay>, offers: HotelOffer[]) {
  const changes: { stay: PricedStay; replaced: boolean }[] = [];
  for (const offer of offers) {
    const priced = priceStayOffer(offer);
    if (!priced) continue;
    const current = state.get(priced.hotelKey);
    if (!current) {
      state.set(priced.hotelKey, priced);
      changes.push({ stay: priced, replaced: false });
      continue;
    }
    if (!replaces(current, priced)) {
      const filled = fillStay(current, priced);
      if (filled !== current && (filled.hotelId !== current.hotelId || filled.coords !== current.coords || filled.images !== current.images)) {
        state.set(priced.hotelKey, filled);
        changes.push({ stay: filled, replaced: true });
      }
      continue;
    }
    const next = fillStay(priced, current);
    state.set(priced.hotelKey, next);
    changes.push({ stay: next, replaced: true });
  }
  return changes;
}

export function toClientHotel(stay: PricedStay, nights: number, offerId: string | null): ClientHotel {
  return {
    offerId,
    hotelKey: stay.hotelKey,
    name: stay.hotelName,
    city: stay.city,
    room: stay.roomLabel,
    photo: stay.photoUrl,
    thumb: stay.thumbUrl,
    sellCents: stay.sellCents,
    perNightCents: perNightCents(stay.sellCents, nights),
    currency: stay.currency,
    nights,
    benefits: stay.benefits,
    perks: stay.perks,
    hotelId: stay.hotelId,
    description: stay.description,
    images: stay.images,
    coords: stay.coords,
    footnotes: stay.footnotes,
  };
}

export function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function* yieldAsCompleted<T>(
  tasks: Promise<T>[]
): AsyncGenerator<{ ok: true; value: T } | { ok: false }> {
  const wrapped = tasks.map((task, index) =>
    task.then(
      (value) => ({ index, result: { ok: true as const, value } }),
      () => ({ index, result: { ok: false as const } })
    )
  );
  const pending = new Set(wrapped);
  while (pending.size) {
    const done = await Promise.race(pending);
    pending.delete(wrapped[done.index]);
    yield done.result;
  }
}

export async function* streamHotelSearch(input: {
  accounts: Array<() => Promise<HotelOffer[]>>;
  cached: PricedStay[] | null;
  timeoutMs?: number;
  clock?: () => number;
}): AsyncGenerator<HotelStreamEvent> {
  const clock = input.clock || Date.now;
  const t0 = clock();
  yield { type: "start" };
  if (input.cached) {
    let tFirst: number | null = null;
    for (const stay of input.cached) {
      if (tFirst == null) tFirst = Math.max(0, clock() - t0);
      yield { type: "hotel", stay, replaced: false };
    }
    yield {
      type: "done",
      tFirstMs: tFirst,
      tDoneMs: Math.max(0, clock() - t0),
      cached: true,
      count: input.cached.length,
    };
    return;
  }
  const state = new Map<string, PricedStay>();
  let tFirst: number | null = null;
  const timeoutMs = input.timeoutMs ?? 9000;
  const tasks = input.accounts.map((search) => deadline(search(), timeoutMs));
  for await (const result of yieldAsCompleted(tasks)) {
    if (!result.ok) {
      yield { type: "supplier_error" };
      continue;
    }
    for (const change of mergeOffers(state, result.value)) {
      if (tFirst == null) tFirst = Math.max(0, clock() - t0);
      yield { type: "hotel", stay: change.stay, replaced: change.replaced };
    }
  }
  yield {
    type: "done",
    tFirstMs: tFirst,
    tDoneMs: Math.max(0, clock() - t0),
    cached: false,
    count: state.size,
  };
}

function suggestionId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function suggestionsFromCatalog(
  rows: { hotel_name: string; city: string; le_hotel_id?: number | null }[],
  query: string
): PlaceSuggestion[] {
  const needle = foldHotelLabel(query);
  if (!needle) return [];
  const cities = new Set<string>();
  const hotels: PlaceSuggestion[] = [];
  for (const row of rows) {
    const city = row.city.replace(/\s+/g, " ").trim();
    const name = row.hotel_name.replace(/\s+/g, " ").trim();
    if (city && foldHotelLabel(city).includes(needle) && !cities.has(foldHotelLabel(city))) {
      cities.add(foldHotelLabel(city));
    }
    if (name && foldHotelLabel(name).includes(needle)) {
      hotels.push({ label: name, kind: "hotel", detail: city, id: suggestionId(row.le_hotel_id) });
    }
  }
  const places = [...cities].map((city) => {
    const original = rows.find((row) => foldHotelLabel(row.city) === city)?.city || city;
    return { label: original.replace(/\s+/g, " ").trim(), kind: "ville" as const, detail: "", id: null };
  });
  return [...places, ...hotels];
}

export function mergePlaceSuggestions(lists: PlaceSuggestion[][], limit = 16): PlaceSuggestion[] {
  const seen = new Map<string, number>();
  const out: PlaceSuggestion[] = [];
  for (const list of lists) {
    for (const item of list) {
      const label = item.label.replace(/\s+/g, " ").trim();
      if (!label) continue;
      const key = `${item.kind}|${foldHotelLabel(label)}|${foldHotelLabel(item.detail)}`;
      const next: PlaceSuggestion = {
        label,
        kind: item.kind,
        detail: item.detail.replace(/\s+/g, " ").trim(),
        id: suggestionId(item.id),
      };
      const at = seen.get(key);
      if (at != null) {
        if (next.id != null && out[at]?.id == null) out[at] = next;
        continue;
      }
      if (out.length >= limit) return out;
      seen.set(key, out.length);
      out.push(next);
    }
  }
  return out;
}
