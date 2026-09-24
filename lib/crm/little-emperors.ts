import { timingSafeEqual } from "node:crypto";

/** API de test uniquement. La clé de test ne part pas vers api.littleemperors.com ni vers Vercel Production. */
export const LITTLE_EMPERORS_STAGING_ORIGIN = "https://api-staging.littleemperors.com";

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

export type LeBooking = {
  id: number;
  hotel_id: number | null;
  hotel_name: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  check_in: string | null;
  check_out: string | null;
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
};

export type LeHotelPublic = {
  name: string | null;
  address: string | null;
  location: string | null;
  website: string | null;
};

export function littleEmperorsProductionBlocked() {
  return process.env.VERCEL_ENV === "production";
}

/** Vide en production Vercel, même si la variable a été copiée par erreur. */
export function littleEmperorsApiKey() {
  if (littleEmperorsProductionBlocked()) return "";
  return (process.env.LITTLE_EMPERORS_API_KEY || "").trim();
}

export function littleEmperorsConfigured() {
  return Boolean(littleEmperorsApiKey());
}

export function littleEmperorsOrigin() {
  if (littleEmperorsProductionBlocked()) {
    throw new LittleEmperorsError(
      "La clé de test Little Emperors n’est pas utilisée sur la production Travelba.",
      403,
      "vercel_production"
    );
  }
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
      "La clé de test ne s’utilise pas sur l’API de production Little Emperors.",
      403,
      "production_refused"
    );
  }
  if (url.hostname !== "api-staging.littleemperors.com") {
    throw new LittleEmperorsError(
      "Seul l’environnement de test Little Emperors est autorisé.",
      403,
      "staging_only"
    );
  }
  return url.origin;
}

export function webhookKeyMatches(given: string, expected: string) {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
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
  const response = await fetchImpl(`${littleEmperorsOrigin()}${path}`, { ...init, headers });
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

/** Fiche hôtel : nom, adresse, lieu, site. Téléphone et e-mail ignorés, même s’ils apparaissaient. */
export function hotelPublicFields(payload: unknown): LeHotelPublic {
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    name: text(row.name),
    address: text(row.address),
    location: text(row.location),
    website: text(row.website),
  };
}

export function parseLeBooking(payload: unknown): LeBooking | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const id = integer(row.id);
  if (id == null) return null;
  const rooms = Array.isArray(row.rooms) ? row.rooms : [];
  const guestNames: string[] = [];
  const policies: string[] = [];
  const roomTypes: string[] = [];
  const benefits: string[] = [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const item = room as Record<string, unknown>;
    const guest = text(item.guest_name);
    if (guest) guestNames.push(guest);
    const policy = text(item.cancellation_policy);
    if (policy) policies.push(policy);
    const roomType = text(item.room_type);
    if (roomType) roomTypes.push(roomType);
    for (const benefit of stringList(item.benefits)) benefits.push(benefit);
  }
  const cost = row.total_cost;
  return {
    id,
    hotel_id: integer(row.hotel_id),
    hotel_name: text(row.hotel_name),
    city: text(row.city),
    address: text(row.address),
    website: null,
    check_in: leDateOnly(text(row.check_in)),
    check_out: leDateOnly(text(row.check_out)),
    state: text(row.state),
    confirmation_number: text(row.confirmation_number),
    total_cost: typeof cost === "number" && Number.isFinite(cost) ? String(cost) : text(cost),
    currency: text(row.currency),
    is_cancellable: typeof row.is_cancellable === "boolean" ? row.is_cancellable : null,
    cancellation_deadline: text(row.cancellation_deadline),
    guest_names: guestNames,
    cancellation_policies: policies,
    room_types: roomTypes,
    benefits,
  };
}

export function applyHotelPublicFields(booking: LeBooking, hotel: LeHotelPublic): LeBooking {
  return {
    ...booking,
    hotel_name: booking.hotel_name || hotel.name,
    address: booking.address || hotel.address,
    website: hotel.website,
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

/** Procédure d’initialisation staging : POST /v1/login, puis ouverture du lien de consentement. */
export async function requestLittleEmperorsSso(
  input: { email: string; name: string },
  fetchImpl?: typeof fetch
) {
  const email = input.email.trim();
  const name = input.name.trim();
  if (!email.includes("@") || name.length < 2) {
    throw new LittleEmperorsError(
      "Indiquez l’e-mail et le nom pour l’initialisation de test.",
      400,
      "sso_input"
    );
  }
  const payload = await leJson(
    "/v1/login",
    { method: "POST", body: JSON.stringify({ email, name }) },
    fetchImpl
  );
  const redirect =
    payload && typeof payload === "object" && "redirect_url" in payload
      ? text((payload as { redirect_url?: unknown }).redirect_url)
      : null;
  if (!redirect || !redirect.startsWith("https://")) {
    throw new LittleEmperorsError(
      "Little Emperors n’a pas renvoyé de lien d’initialisation.",
      502,
      "sso_redirect"
    );
  }
  return { redirect_url: redirect };
}

export function parseLeWebhook(body: unknown): { event: string; booking: LeBooking | null } | null {
  if (!body || typeof body !== "object") return null;
  const event = text((body as { event?: unknown }).event);
  if (!event) return null;
  const data = (body as { data?: unknown }).data;
  return { event, booking: parseLeBooking(data) };
}
