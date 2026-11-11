import type { RatehawkConfig } from "./config";
import { etgPost, type EtgCall } from "./client";
import {
  collectImageUrls,
  matchRoomGroup,
  mealLabel,
  partitionTaxes,
  penaltyLines,
  pickPaymentType,
  preferHotelImages,
  shownPrice,
  type PaymentType,
  type RgExt,
  type RoomGroupStatic,
} from "./display";
import type { RoomGuests } from "./limits";

export type SearchInput = {
  checkin: string;
  checkout: string;
  residency: string;
  guests: RoomGuests[];
  currency: string;
  timeout: number;
};


export type ShownRate = {
  book_hash: string;
  room_name: string;
  meal_code: string;
  meal_label: string;
  payment_type: string;
  amount: string;
  currency_code: string;
  show_amount: string;
  show_currency_code: string;
  sell_amount: string | null;
  needs_card: boolean;
  excluded_taxes: { name: string; amount: string; currency_code: string }[];
  penalties: { text: string }[];
  free_cancellation_before: string | null;
  rg_ext: RgExt | null;
  room_images: string[];
  room_amenities: string[];
};

export type HotelCard = {
  hid: number;
  name: string;
  region_id: number | null;
  rates: ShownRate[];
  images: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function guestBody(guests: RoomGuests[]) {
  return guests.map((room) => ({ adults: room.adults, children: room.children }));
}

export function searchBody(input: SearchInput, extra: Record<string, unknown>, language: string) {
  return {
    checkin: input.checkin,
    checkout: input.checkout,
    residency: input.residency,
    language,
    guests: guestBody(input.guests),
    currency: input.currency,
    timeout: input.timeout,
    ...extra,
  };
}

function paymentOf(rate: Record<string, unknown>, preferred: string): PaymentType | null {
  const options = asRecord(rate.payment_options);
  const types = Array.isArray(options?.payment_types) ? (options.payment_types as PaymentType[]) : [];
  const chosen = pickPaymentType(types, preferred);
  if (!chosen) return null;
  const penalties = asRecord(rate.cancellation_penalties);
  if (!penalties) return chosen;
  const policies = Array.isArray(penalties.policies) ? penalties.policies : [];
  return {
    ...chosen,
    cancellation_penalties: {
      policies: policies as NonNullable<PaymentType["cancellation_penalties"]>["policies"],
      free_cancellation_before: typeof penalties.free_cancellation_before === "string" ? penalties.free_cancellation_before : null,
    },
  };
}

export function normalizeRate(
  rate: Record<string, unknown>,
  config: Pick<RatehawkConfig, "paymentType" | "marginPercent">,
  roomGroups: RoomGroupStatic[] = [],
  requireHash = true
): ShownRate | null {
  const hash = typeof rate.book_hash === "string" ? rate.book_hash : "";
  if (requireHash && !hash.startsWith("h-") && !hash.startsWith("p-")) return null;
  const payment = paymentOf(rate, config.paymentType);
  if (!payment?.amount || !payment.currency_code) return null;
  const meal = mealLabel(typeof rate.meal_data === "object" && rate.meal_data && "value" in rate.meal_data ? String((rate.meal_data as { value?: string }).value || "") : String(rate.meal || ""));
  const taxes = partitionTaxes(asRecord(payment.tax_data)?.taxes);
  const price = shownPrice(payment, config.marginPercent);
  const rg = asRecord(rate.rg_ext) as RgExt | null;
  const group = matchRoomGroup(rg, roomGroups);
  const policies = payment.cancellation_penalties?.policies || [];
  return {
    book_hash: hash,
    room_name: String(rate.room_name || "Chambre"),
    meal_code: meal.code,
    meal_label: meal.label,
    payment_type: String(payment.type || config.paymentType),
    amount: String(payment.amount),
    currency_code: String(payment.currency_code),
    show_amount: String(payment.show_amount || payment.amount),
    show_currency_code: String(payment.show_currency_code || payment.currency_code),
    sell_amount: price.sell == null ? null : price.sell.toFixed(2),
    needs_card: Boolean(payment.is_need_credit_card_data || payment.is_need_cvc),
    excluded_taxes: taxes.excluded.map((tax) => ({ name: tax.name, amount: tax.amount, currency_code: tax.currency_code })),
    penalties: penaltyLines(policies, payment.cancellation_penalties?.free_cancellation_before, price.currency || String(payment.show_currency_code || payment.currency_code)),
    free_cancellation_before: payment.cancellation_penalties?.free_cancellation_before || null,
    rg_ext: rg,
    room_images: collectImageUrls([group?.images, group?.images_ext], 4),
    room_amenities: group?.room_amenities || [],
  };
}

function lowest(rates: ShownRate[], count: number) {
  return [...rates].sort((a, b) => Number(a.show_amount) - Number(b.show_amount)).slice(0, count);
}

export function normalizeHotels(
  data: unknown,
  config: Pick<RatehawkConfig, "paymentType" | "marginPercent">,
  roomGroups: RoomGroupStatic[] = [],
  rateLimit = 2,
  requireHash = false
): HotelCard[] {
  const root = asRecord(data);
  const hotels = Array.isArray(root?.hotels)
    ? root.hotels
    : Array.isArray(data)
      ? data
      : root?.hid && root?.rates
        ? [root]
        : [];
  const cards: HotelCard[] = [];
  for (const hotel of hotels) {
    const row = asRecord(hotel);
    if (!row) continue;
    const hid = Number(row.hid);
    if (!Number.isInteger(hid)) continue;
    const rates = (Array.isArray(row.rates) ? row.rates : [])
      .map((rate) => normalizeRate(asRecord(rate) || {}, config, roomGroups, requireHash))
      .filter((rate): rate is ShownRate => Boolean(rate));
    cards.push({
      hid,
      name: String(row.name || row.id || `Hôtel ${hid}`),
      region_id: row.region_id == null ? null : Number(row.region_id) || null,
      images: collectImageUrls(row.images_ext ?? row.images, 8),
      rates: lowest(rates, rateLimit),
    });
  }
  return cards;
}

export async function searchRegion(input: SearchInput, regionId: number, config: RatehawkConfig) {
  const call = await etgPost(
    "/api/b2b/v3/search/serp/region/",
    searchBody(input, { region_id: regionId }, config.language),
    (input.timeout + 5) * 1000,
    null,
    config
  );
  return { call, hotels: normalizeHotels(call.data, config, [], 2) };
}

export async function searchGeo(input: SearchInput, latitude: number, longitude: number, radius: number, config: RatehawkConfig) {
  const call = await etgPost(
    "/api/b2b/v3/search/serp/geo/",
    searchBody(input, { latitude, longitude, radius }, config.language),
    (input.timeout + 5) * 1000,
    null,
    config
  );
  return { call, hotels: normalizeHotels(call.data, config, [], 2) };
}

export async function searchHids(input: SearchInput, hids: number[], config: RatehawkConfig) {
  const call = await etgPost(
    "/api/b2b/v3/search/serp/hotels/",
    searchBody(input, { hids }, config.language),
    (input.timeout + 5) * 1000,
    null,
    config
  );
  return { call, hotels: normalizeHotels(call.data, config, [], 2) };
}

export async function hotelPage(input: SearchInput, hid: number, config: RatehawkConfig, roomGroups: RoomGroupStatic[] = []) {
  const call = await etgPost(
    "/api/b2b/v3/search/hp/",
    searchBody(input, { hid }, config.language),
    (input.timeout + 5) * 1000,
    null,
    config
  );
  const hotels = normalizeHotels(call.data, config, roomGroups, 200, true);
  return { call, hotel: hotels[0] || null };
}

export function callFailed(call: EtgCall) {
  return call.httpStatus === 0 || call.httpStatus >= 400 || (call.error != null && call.status !== "ok");
}

/** Huit hôtels dans la liste. La fiche hôtel, elle, garde tous ses tarifs. */
export const RATEHAWK_LIST_CAP = 8;
export const RATEHAWK_PHOTO_CAP = 3;

export type StoredHotelFacts = {
  hid: number;
  name?: string | null;
  address?: string | null;
  star_rating?: number | null;
  images?: unknown;
  images_ext?: unknown;
  room_groups?: RoomGroupStatic[];
};

export type SearchRateView = {
  hash: string;
  chambre: string;
  repas: string;
  net: string;
  vente: string | null;
  devise: string;
  remboursable: boolean;
  annulation_gratuite_avant: string | null;
  paiement: string;
};

export type SearchHotelView = {
  nom: string;
  hid: number;
  etoiles: number | null;
  adresse: string | null;
  photos: string[];
  tarifs: SearchRateView[];
};

export function presentHotels(
  cards: HotelCard[],
  stored: StoredHotelFacts[] = [],
  hotelLimit = RATEHAWK_LIST_CAP
): { hotels: SearchHotelView[]; tronque: boolean } {
  const byHid = new Map(stored.map((row) => [row.hid, row]));
  return {
    tronque: cards.length > hotelLimit,
    hotels: cards.slice(0, hotelLimit).map((card) => {
      const facts = byHid.get(card.hid);
      const fromStore = facts ? preferHotelImages(facts.images, facts.images_ext, RATEHAWK_PHOTO_CAP) : [];
      const stars = facts?.star_rating;
      const address = typeof facts?.address === "string" ? facts.address.trim() : "";
      const storedName = typeof facts?.name === "string" ? facts.name.trim() : "";
      return {
        nom: storedName || card.name,
        hid: card.hid,
        etoiles: typeof stars === "number" && Number.isInteger(stars) && stars >= 0 && stars <= 5 ? stars : null,
        adresse: address || null,
        photos: fromStore.length ? fromStore : card.images.slice(0, RATEHAWK_PHOTO_CAP),
        tarifs: card.rates.map((rate) => ({
          hash: rate.book_hash,
          chambre: rate.room_name,
          repas: rate.meal_label,
          net: rate.show_amount,
          vente: rate.sell_amount,
          devise: rate.show_currency_code,
          remboursable: Boolean(rate.free_cancellation_before),
          annulation_gratuite_avant: rate.free_cancellation_before,
          paiement: rate.payment_type,
        })),
      };
    }),
  };
}

export type CompletionChoice = { kind: "region"; id: number; nom: string } | { kind: "hotel"; hid: number; nom: string };

function foldName(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function scoreName(needle: string, name: string) {
  const folded = foldName(name);
  if (!needle || !folded) return 0;
  if (folded === needle) return 100;
  if (folded.startsWith(needle)) return 70;
  if (folded.includes(needle)) return 40;
  return 0;
}

/** Ville d’abord. Un hôtel dont le nom ou le slug est exact passe devant une région approchante. */
export function pickCompletion(query: string, data: unknown): CompletionChoice | null {
  const root = asRecord(data);
  const needle = foldName(query);
  if (!needle) return null;
  const numeric = /^\d+$/.test(query.trim()) ? Number(query.trim()) : null;
  const scored: { score: number; choice: CompletionChoice }[] = [];
  for (const region of Array.isArray(root?.regions) ? root.regions : []) {
    const row = asRecord(region);
    if (!row) continue;
    const id = Number(row.id);
    if (!Number.isInteger(id) || id < 1) continue;
    const nom = String(row.name || "").trim();
    let score = scoreName(needle, nom);
    if (numeric != null && id === numeric) score = 120;
    if (score > 0 && String(row.type || "").toLowerCase() === "city") score += 10;
    if (score > 0) scored.push({ score, choice: { kind: "region", id, nom: nom || `Région ${id}` } });
  }
  for (const hotel of Array.isArray(root?.hotels) ? root.hotels : []) {
    const row = asRecord(hotel);
    if (!row) continue;
    const hid = Number(row.hid);
    if (!Number.isInteger(hid) || hid < 1) continue;
    const nom = String(row.name || "").trim();
    const slug = typeof row.id === "string" ? row.id.trim() : "";
    let score = Math.max(scoreName(needle, nom), scoreName(needle, slug));
    if (numeric != null && hid === numeric) score = 130;
    if (score > 0) scored.push({ score, choice: { kind: "hotel", hid, nom: nom || slug || `Hôtel ${hid}` } });
  }
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.choice ?? null;
}

export async function completeQuery(query: string, config: RatehawkConfig) {
  const call = await etgPost(
    "/api/b2b/v3/search/multicomplete/",
    { query: query.trim().slice(0, 80), language: config.language },
    10_000,
    null,
    config
  );
  return { call, choice: pickCompletion(query, call.data) };
}
