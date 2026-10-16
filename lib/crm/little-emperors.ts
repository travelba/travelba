import { secretEquals } from "./secret-equals";

/** Revue et preview. La clé de test ne part pas vers l’hôte de production. */
export const LITTLE_EMPERORS_STAGING_ORIGIN = "https://api-staging.littleemperors.com";

/** Compte de production. Seulement quand Vercel est en production. */
export const LITTLE_EMPERORS_PRODUCTION_ORIGIN = "https://api.littleemperors.com";

const PRODUCTION_HOST = "api.littleemperors.com";

export class LittleEmperorsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "LittleEmperorsError";
  }
}

export type LeRoomChild = { age: number | null; name: string | null };

export type LeRoom = {
  id: number | null;
  guest_name: string | null;
  room_type: string | null;
  adults: number | null;
  children: LeRoomChild[];
  cancellation_policy: string | null;
  deposit_policy: string | null;
  total_cost: string | null;
  benefits: string[];
  additional_benefits: string[];
  benefits_footnotes: string[];
  public_inclusions: string[];
  rate_title: string[];
  has_upgrade_benefit: boolean | null;
  eta: string | null;
  images: string[];
};

export type LeBooking = {
  id: number;
  hotel_id: number | null;
  hotel_name: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  description: string | null;
  check_in: string | null;
  check_out: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  latitude: string | null;
  longitude: string | null;
  eta: string | null;
  image: string | null;
  state: string | null;
  confirmation_number: string | null;
  total_cost: string | null;
  currency: string | null;
  is_cancellable: boolean | null;
  cancellation_deadline: string | null;
  guest_names: string[];
  cancellation_policies: string[];
  room_types: string[];
  benefits: string[];
  rooms: LeRoom[];
};

export type LeHotelPublic = {
  name: string | null;
  address: string | null;
  location: string | null;
  website: string | null;
  description: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  image: string | null;
};

/** Vercel Production appelle l’API de production. La preview et le local restent sur le staging. */
export function littleEmperorsProductionRuntime() {
  return process.env.VERCEL_ENV === "production";
}

/** Plus de blocage : la production lit la clé de production. Le nom reste pour l’écran. */
export function littleEmperorsProductionBlocked() {
  return false;
}

export function littleEmperorsApiKey() {
  return (process.env.LITTLE_EMPERORS_API_KEY || "").trim();
}

export function littleEmperorsConfigured() {
  return Boolean(littleEmperorsApiKey());
}

export function littleEmperorsOrigin() {
  if (littleEmperorsProductionRuntime()) return LITTLE_EMPERORS_PRODUCTION_ORIGIN;
  const raw = (process.env.LITTLE_EMPERORS_API_BASE || LITTLE_EMPERORS_STAGING_ORIGIN)
    .trim()
    .replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LittleEmperorsError(
      "L’adresse de l’API Little Emperors est invalide.",
      500,
      "bad_base"
    );
  }
  if (url.hostname === PRODUCTION_HOST) {
    throw new LittleEmperorsError(
      "La clé de test reste sur l’API de staging. La production utilise la clé de production.",
      403,
      "production_refused"
    );
  }
  if (url.hostname !== "api-staging.littleemperors.com") {
    throw new LittleEmperorsError(
      "Cette revue appelle l’API de staging Little Emperors.",
      403,
      "staging_only"
    );
  }
  return url.origin;
}

export function webhookKeyMatches(given: string, expected: string) {
  if (!given || !expected) return false;
  return secretEquals(given, expected);
}

/** Présent ou absent. Ne renvoie jamais la valeur. */
export function littleEmperorsWebhookConfigured() {
  return Boolean((process.env.LITTLE_EMPERORS_WEBHOOK_KEY || "").trim());
}

/** Message montré au partenaire. Le texte français de l’agence ne part pas tel quel. */
export function littleEmperorsPartnerMessage(code: string) {
  switch (code) {
    case "vercel_production":
      return "Production will call the Little Emperors production API once that key is issued. The test key stays on the staging review.";
    case "not_configured":
      return "The Little Emperors key is not on this environment yet.";
    case "bookings_null":
      return "Little Emperors has not attached an account to the test key. No reservation was created.";
    case "unauthorized":
      return "The staging API refused the key.";
    case "staging_only":
    case "production_refused":
    case "bad_base":
      return "This staging deployment calls the Little Emperors staging API.";
    default:
      return "The staging API could not be read.";
  }
}

export function littleEmperorsWebhookAuthorized(headers: Headers) {
  const expected = (process.env.LITTLE_EMPERORS_WEBHOOK_KEY || "").trim();
  if (!expected) return false;
  const access = headers.get("x-access-key")?.trim() || "";
  const auth = headers.get("authorization")?.trim() || "";
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "";
  const given = access || bearer;
  return webhookKeyMatches(given, expected);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const line = text(entry);
    if (line) out.push(line);
  }
  return out;
}

/** Date calendaire telle que renvoyée, sans heure inventée. */
export function leDateOnly(value: string | null | undefined): string | null {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}

export function isLeCancelled(state: string | null | undefined, event?: string | null) {
  if (event === "hotel_booking_cancel") return true;
  const normalized = String(state || "").trim().toLowerCase();
  return normalized === "cancelled" || normalized === "canceled";
}

export function canRemoteCancel(booking: { is_cancellable: boolean | null }) {
  return booking.is_cancellable === true;
}

export function splitGuestName(value: string): { first_name: string; last_name: string } | null {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] };
}

function redact(message: string) {
  const key = littleEmperorsApiKey();
  return key ? message.split(key).join("[redacted]") : message;
}

function mapUpstream(status: number, message: string) {
  const clean = redact(message).slice(0, 400);
  if (clean.includes("bookings() on null")) {
    return new LittleEmperorsError(
      "Little Emperors n’a pas rattaché de compte à la clé de test. Leur API répond : bookings() on null. Aucune réservation n’a été créée.",
      status,
      "bookings_null"
    );
  }
  return new LittleEmperorsError(
    clean || "Little Emperors a refusé l’appel.",
    status,
    status === 401 ? "unauthorized" : "upstream"
  );
}

const LE_TIMEOUT_MS = 10_000;

async function leJson(path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch) {
  const key = littleEmperorsApiKey();
  if (!key) {
    throw new LittleEmperorsError("Little Emperors n’est pas configuré.", 503, "not_configured");
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${key}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetchImpl(`${littleEmperorsOrigin()}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(LE_TIMEOUT_MS),
  });
  const body = await response.text();
  if (!response.ok) {
    let message = body;
    try {
      const json = JSON.parse(body) as { message?: unknown };
      if (typeof json.message === "string") message = json.message;
    } catch {
      message = body;
    }
    throw mapUpstream(response.status, message);
  }
  if (!body.trim()) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new LittleEmperorsError("Réponse Little Emperors illisible.", 502, "invalid_json");
  }
}

function httpsUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function mediaUrl(value: unknown): string | null {
  if (value && typeof value === "object") return httpsUrl((value as { url?: unknown }).url);
  return httpsUrl(value);
}

function mediaList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const url = mediaUrl(entry);
    if (url) out.push(url);
  }
  return out;
}

/** Heure 0–23 telle que renvoyée. Une autre valeur n’est pas une heure. */
export function leHour(value: unknown): string | null {
  const raw = text(value);
  if (!raw || !/^\d{1,2}$/.test(raw)) return null;
  const hour = Number(raw);
  if (hour < 0 || hour > 23) return null;
  return String(hour);
}

function clockText(value: unknown): string | null {
  const raw = text(value);
  if (!raw || !/^\d{1,2}:\d{2}$/.test(raw)) return null;
  return raw;
}

function idSlice(ids: number[] | undefined) {
  return (ids || []).filter((id) => Number.isInteger(id) && id > 0).slice(0, 8);
}

function costText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function childList(value: unknown): LeRoomChild[] {
  if (!Array.isArray(value)) return [];
  const out: LeRoomChild[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const age = typeof row.age === "number" && Number.isFinite(row.age) ? Math.trunc(row.age) : null;
    const name = text(row.name);
    if (age == null && !name) continue;
    out.push({ age, name });
  }
  return out;
}

function shortInfo(value: unknown): { check_in_time: string | null; check_out_time: string | null } {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    check_in_time: clockText(row.check_in_time),
    check_out_time: clockText(row.check_out_time),
  };
}

/** Fiche hôtel : nom, adresse, lieu, site, horaires et image. Téléphone et e-mail ignorés. */
export function hotelPublicFields(payload: unknown): LeHotelPublic {
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const hours = shortInfo(row.short_info);
  const images = mediaList(row.images);
  return {
    name: text(row.name),
    address: text(row.address),
    location: text(row.location),
    website: text(row.website),
    description: text(row.description),
    check_in_time: hours.check_in_time,
    check_out_time: hours.check_out_time,
    image: images[0] || null,
  };
}

export function benefitsFromLeRaw(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  return stringList((raw as { benefits?: unknown }).benefits);
}

function parseLeRoom(payload: unknown): LeRoom | null {
  if (!payload || typeof payload !== "object") return null;
  const item = payload as Record<string, unknown>;
  const adults = integer(item.adults);
  return {
    id: integer(item.id),
    guest_name: text(item.guest_name),
    room_type: text(item.room_type),
    adults,
    children: childList(item.children),
    cancellation_policy: text(item.cancellation_policy),
    deposit_policy: text(item.deposit_policy),
    total_cost: costText(item.total_cost),
    benefits: stringList(item.benefits),
    additional_benefits: stringList(item.additional_benefits),
    benefits_footnotes: stringList(item.benefits_footnotes),
    public_inclusions: stringList(item.public_inclusions),
    rate_title: stringList(item.rate_title),
    has_upgrade_benefit: typeof item.has_upgrade_benefit === "boolean" ? item.has_upgrade_benefit : null,
    eta: leHour(item.eta),
    images: mediaList(item.images),
  };
}

export function parseLeBooking(payload: unknown): LeBooking | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const id = integer(row.id);
  if (id == null) return null;
  const rooms = (Array.isArray(row.rooms) ? row.rooms : [])
    .map(parseLeRoom)
    .filter((room): room is LeRoom => Boolean(room));
  const guestNames: string[] = [];
  const policies: string[] = [];
  const roomTypes: string[] = [];
  const benefits: string[] = [];
  for (const room of rooms) {
    if (room.guest_name) guestNames.push(room.guest_name);
    if (room.cancellation_policy) policies.push(room.cancellation_policy);
    if (room.room_type) roomTypes.push(room.room_type);
    for (const benefit of room.benefits) benefits.push(benefit);
  }
  return {
    id,
    hotel_id: integer(row.hotel_id),
    hotel_name: text(row.hotel_name),
    city: text(row.city),
    address: text(row.address),
    website: null,
    description: null,
    check_in: leDateOnly(text(row.check_in)),
    check_out: leDateOnly(text(row.check_out)),
    check_in_time: null,
    check_out_time: null,
    latitude: text(row.latitude),
    longitude: text(row.longitude),
    eta: leHour(row.eta) || rooms.find((room) => room.eta)?.eta || null,
    image: mediaUrl(row.image),
    state: text(row.state),
    confirmation_number: text(row.confirmation_number),
    total_cost: costText(row.total_cost),
    currency: text(row.currency),
    is_cancellable: typeof row.is_cancellable === "boolean" ? row.is_cancellable : null,
    cancellation_deadline: text(row.cancellation_deadline),
    guest_names: guestNames,
    cancellation_policies: policies,
    room_types: roomTypes,
    benefits,
    rooms,
  };
}

export function applyHotelPublicFields(booking: LeBooking, hotel: LeHotelPublic): LeBooking {
  return {
    ...booking,
    hotel_name: booking.hotel_name || hotel.name,
    address: booking.address || hotel.address,
    website: hotel.website,
    description: booking.description || hotel.description,
    check_in_time: booking.check_in_time || hotel.check_in_time,
    check_out_time: booking.check_out_time || hotel.check_out_time,
    image: booking.image || hotel.image,
  };
}

export async function listLittleEmperorsBookings(fetchImpl?: typeof fetch) {
  const payload = await leJson("/v2/hotels/bookings", { method: "GET" }, fetchImpl);
  if (!Array.isArray(payload)) {
    throw new LittleEmperorsError(
      "Little Emperors n’a pas renvoyé une liste de réservations.",
      502,
      "unexpected_shape"
    );
  }
  const bookings: LeBooking[] = [];
  for (const row of payload) {
    const parsed = parseLeBooking(row);
    if (parsed) bookings.push(parsed);
  }
  return bookings;
}

export async function fetchLittleEmperorsHotel(hotelId: number, fetchImpl?: typeof fetch) {
  const payload = await leJson(`/v2/hotels/${hotelId}`, { method: "GET" }, fetchImpl);
  return hotelPublicFields(payload);
}

export async function cancelLittleEmperorsBooking(bookingId: number, fetchImpl?: typeof fetch) {
  await leJson(`/v2/hotels/bookings/${bookingId}`, { method: "DELETE" }, fetchImpl);
}

export async function fetchLittleEmperorsBooking(bookingId: number, fetchImpl?: typeof fetch) {
  const payload = await leJson(`/v2/hotels/bookings/${bookingId}`, { method: "GET" }, fetchImpl);
  const booking = parseLeBooking(payload);
  if (!booking) {
    throw new LittleEmperorsError("Little Emperors n’a pas renvoyé la réservation.", 502, "unexpected_shape");
  }
  return booking;
}

export type LeSearchHit = {
  id: number;
  text: string;
  type: "hotel" | "location" | "inspiration";
  location: string | null;
};

export function parseLeSearch(payload: unknown): LeSearchHit[] {
  if (!Array.isArray(payload)) return [];
  const out: LeSearchHit[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = integer(row.id);
    const label = text(row.text);
    const type = text(row.type);
    if (id == null || !label) continue;
    if (type !== "hotel" && type !== "location" && type !== "inspiration") continue;
    out.push({ id, text: label, type, location: text(row.location) });
  }
  return out;
}

export async function searchLittleEmperors(query: string, fetchImpl?: typeof fetch) {
  const params = new URLSearchParams({ query: query.trim(), limit: "8" });
  const payload = await leJson(`/v2/search?${params.toString()}`, { method: "GET" }, fetchImpl);
  return parseLeSearch(payload);
}

export type LeGroup = { id: number; name: string };

export function parseLeGroups(payload: unknown): LeGroup[] {
  const data =
    payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray(payload)
        ? payload
        : [];
  const out: LeGroup[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = integer(row.id);
    const name = text(row.name);
    if (id == null || !name) continue;
    out.push({ id, name });
  }
  return out;
}

export async function listLittleEmperorsGroups(name: string, fetchImpl?: typeof fetch) {
  const params = new URLSearchParams({ per_page: "12", name: name.trim() });
  const payload = await leJson(`/v2/hotel-groups?${params.toString()}`, { method: "GET" }, fetchImpl);
  return parseLeGroups(payload);
}

export type LeRate = {
  rate_index: string;
  title: string | null;
  total: string | null;
  currency: string | null;
  tax_included: boolean | null;
  cancellation_policy: string | null;
  can_cancel: boolean | null;
  cancellation_deadline: string | null;
  payment_description: string | null;
  requires_cvc: boolean | null;
  benefits: string[];
  benefits_footnotes: string[];
  stay_requirements: string[];
};

export type LeAvailabilityRoom = {
  name: string;
  description: string | null;
  rates: LeRate[];
};

export type LeAvailability = {
  session_id: string | null;
  hotel_id: number | null;
  hotel_name: string | null;
  lowest_total: string | null;
  currency: string | null;
  rooms: LeAvailabilityRoom[];
};

function parseLeRate(payload: unknown): LeRate | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const rateIndex = text(row.rate_index);
  if (!rateIndex) return null;
  return {
    rate_index: rateIndex,
    title: text(row.title),
    total: costText(row.total_to_book_in_requested_currency ?? row.total_to_book ?? row.rate),
    currency: text(row.requested_currency_code) || text(row.currency_code),
    tax_included: typeof row.is_tax_included === "boolean" ? row.is_tax_included : null,
    cancellation_policy: text(row.cancellation_policy),
    can_cancel: typeof row.can_cancel === "boolean" ? row.can_cancel : null,
    cancellation_deadline: text(row.cancellation_deadline),
    payment_description: text(row.payment_description),
    requires_cvc: typeof row.requires_cvc === "boolean" ? row.requires_cvc : null,
    benefits: stringList(row.benefits),
    benefits_footnotes: stringList(row.benefits_footnotes),
    stay_requirements: stringList(row.stay_requirements),
  };
}

export function parseLeAvailability(payload: unknown): LeAvailability[] {
  if (!Array.isArray(payload)) return [];
  const out: LeAvailability[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const rooms: LeAvailabilityRoom[] = [];
    for (const room of Array.isArray(row.room_types) ? row.room_types : []) {
      if (!room || typeof room !== "object") continue;
      const item = room as Record<string, unknown>;
      const name = text(item.name);
      if (!name) continue;
      const rates = (Array.isArray(item.rates) ? item.rates : [])
        .map(parseLeRate)
        .filter((rate): rate is LeRate => Boolean(rate));
      rooms.push({ name, description: text(item.description), rates });
    }
    const lowest = row.lowest_rate && typeof row.lowest_rate === "object" ? (row.lowest_rate as Record<string, unknown>) : null;
    out.push({
      session_id: text(row.session_id),
      hotel_id: integer(row.hotel_id),
      hotel_name: text(row.hotel_name),
      lowest_total: lowest ? costText(lowest.total_to_book_in_requested_currency ?? lowest.rate) : null,
      currency: lowest ? text(lowest.requested_currency_code) || text(lowest.currency_code) : null,
      rooms,
    });
  }
  return out;
}

export type LeFilterOption = { id: number; name: string };

const FILTER_KEYS = [
  "activities",
  "family_facilities",
  "hotel_facilities",
  "locations",
  "property_types",
  "trip_types",
  "wellness",
] as const;

export function parseLeFilters(payload: unknown): Record<string, LeFilterOption[]> {
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const out: Record<string, LeFilterOption[]> = {};
  for (const key of FILTER_KEYS) {
    const list = Array.isArray(row[key]) ? row[key] : [];
    const options: LeFilterOption[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const id = integer(item.id);
      const name = text(item.name);
      if (id == null || !name) continue;
      options.push({ id, name });
    }
    if (options.length) out[key] = options;
  }
  return out;
}

export async function listLittleEmperorsFilters(fetchImpl?: typeof fetch) {
  const payload = await leJson("/v2/hotels/filters", { method: "GET" }, fetchImpl);
  return parseLeFilters(payload);
}

export type LeAvailabilityQuery = {
  start_date: string;
  end_date: string;
  currency: string;
  hotel_id?: number | null;
  location_id?: number | null;
  inspiration_id?: number | null;
  hotel_group_ids?: number[];
  activities_ids?: number[];
  family_facilities_ids?: number[];
  hotel_facilities_ids?: number[];
  property_types_ids?: number[];
  location_types_ids?: number[];
  trip_types_ids?: number[];
  wellness_ids?: number[];
  adults: number;
  children_ages?: number[];
};

export async function littleEmperorsAvailability(query: LeAvailabilityQuery, fetchImpl?: typeof fetch) {
  const body: Record<string, unknown> = {
    start_date: query.start_date,
    end_date: query.end_date,
    currency: query.currency,
    rooms: [
      {
        adults: query.adults,
        children: (query.children_ages || []).map((age) => ({ age })),
      },
    ],
  };
  if (query.hotel_id) body.hotel_id = query.hotel_id;
  if (query.location_id) body.location_id = query.location_id;
  if (query.inspiration_id) body.inspiration_id = query.inspiration_id;
  const filters = {
    hotel_group_ids: idSlice(query.hotel_group_ids),
    activities_ids: idSlice(query.activities_ids),
    family_facilities_ids: idSlice(query.family_facilities_ids),
    hotel_facilities_ids: idSlice(query.hotel_facilities_ids),
    property_types_ids: idSlice(query.property_types_ids),
    location_types_ids: idSlice(query.location_types_ids),
    trip_types_ids: idSlice(query.trip_types_ids),
    wellness_ids: idSlice(query.wellness_ids),
  };
  if (Object.values(filters).some((ids) => ids.length)) body.filters = filters;
  const payload = await leJson("/v2/hotels/availability", { method: "POST", body: JSON.stringify(body) }, fetchImpl);
  return parseLeAvailability(payload);
}

export type LeCalendarDay = { date: string; rate: string; currency: string | null; is_closed: boolean };

export function parseLeCalendar(payload: unknown): LeCalendarDay[] {
  if (!Array.isArray(payload)) return [];
  const out: LeCalendarDay[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const date = leDateOnly(text(row.date));
    const rate = text(row.rate);
    if (!date || !rate) continue;
    out.push({
      date,
      rate,
      currency: text(row.currency),
      is_closed: row.is_closed === true,
    });
  }
  return out;
}

export async function littleEmperorsCalendar(hotelId: number, currency: string, fetchImpl?: typeof fetch) {
  const params = new URLSearchParams({ currency });
  const payload = await leJson(`/v2/hotels/${hotelId}/calendar?${params.toString()}`, { method: "GET" }, fetchImpl);
  return parseLeCalendar(payload);
}

export type LeBookRoom = {
  adults: number;
  children: { age: number }[];
  guest_name?: string | null;
};

export type LeBookRequest = {
  start_date: string;
  end_date: string;
  session_id: string;
  rate_index: string;
  hotel_id: number;
  guest_name: string;
  guest_email: string;
  eta?: string | null;
  loyalty_number?: string | null;
  rooms: LeBookRoom[];
};

/** Corps d’émission. Jamais de numéro de carte : le widget l’attache au session_id. */
export function leBookBody(input: LeBookRequest) {
  return {
    start_date: input.start_date,
    end_date: input.end_date,
    session_id: input.session_id,
    rate_index: input.rate_index,
    hotel_id: input.hotel_id,
    guest_name: input.guest_name,
    guest_email: input.guest_email,
    ...(input.eta ? { eta: input.eta } : {}),
    ...(input.loyalty_number ? { loyalty_number: input.loyalty_number } : {}),
    rooms: input.rooms.map((room) => ({
      adults: room.adults,
      children: room.children,
      ...(room.guest_name ? { guest_name: room.guest_name } : {}),
      send_email_to_guest: false,
    })),
  };
}

export async function createLittleEmperorsBooking(input: LeBookRequest, fetchImpl?: typeof fetch) {
  const payload = await leJson(
    "/v2/hotels/bookings",
    { method: "POST", body: JSON.stringify(leBookBody(input)) },
    fetchImpl
  );
  const booking = parseLeBooking(payload);
  if (!booking) {
    throw new LittleEmperorsError("Little Emperors n’a pas renvoyé la réservation créée.", 502, "unexpected_shape");
  }
  return booking;
}

const SESSION_ID = /^[A-Za-z0-9_-]{4,80}$/;

/** Iframe carte. Le numéro ne traverse pas Travelba. */
export function littleEmperorsWidgetUrl(sessionId: string) {
  if (!SESSION_ID.test(sessionId)) return null;
  const origin = littleEmperorsProductionRuntime()
    ? LITTLE_EMPERORS_PRODUCTION_ORIGIN
    : LITTLE_EMPERORS_STAGING_ORIGIN;
  return `${origin}/widgets/credit-card?session_id=${encodeURIComponent(sessionId)}`;
}

const AGENCY_ACTIONS = new Set([
  "attach",
  "cancel",
  "search",
  "availability",
  "calendar",
  "groups",
  "filters",
  "quote",
  "book",
]);

/** Actualiser : agence et partenaire. Le reste : agence seulement. */
export function littleEmperorsActionAllowed(role: "admin" | "agent" | "partner", action: string) {
  if (action === "sync") return true;
  if (role === "partner") return false;
  return AGENCY_ACTIONS.has(action);
}

export function parseLeWebhook(body: unknown): { event: string; booking: LeBooking | null } | null {
  if (!body || typeof body !== "object") return null;
  const event = text((body as { event?: unknown }).event);
  if (!event) return null;
  const data = (body as { data?: unknown }).data;
  return { event, booking: parseLeBooking(data) };
}
