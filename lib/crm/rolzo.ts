import { toE164 } from "@/lib/crm/phone";
import type { ExtraLeg, ServicePlace } from "@/lib/crm/extras";
import { chauffeurReferenceId, rolzoStatusLabel as statusLabel } from "@/lib/crm/rolzo-prefill";

/** Iframe et hôte web. Staging d’abord. */
export const ROLZO_STAGING_WEB_HOST = "https://staging.rolzo.com";

/**
 * Base documentée : `{API_BASE}/api/v1/external/...`.
 * Sur staging cela donne `https://staging.rolzo.com/api/api/v1/external`.
 */
export const ROLZO_STAGING_API_BASE = "https://staging.rolzo.com/api";

const PRODUCTION_FLAG = "ROLZO_ALLOW_PRODUCTION";

export class RolzoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "RolzoError";
  }
}

export type RolzoCustomer = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
};

export type RolzoBookingView = {
  id: string;
  status: string | null;
  vehicle: string | null;
  driver: string | null;
  price: number | null;
  currency: string | null;
  cancellationPolicy: string | null;
  cancellationFee: number | null;
  referenceId: string | null;
};

export type ChauffeurItemFields = {
  kind: "chauffeur";
  title: string;
  supplier: string;
  confirmation_ref: string;
  start_at: string | null;
  end_at: null;
  amount: number | null;
  include_in_ledger: boolean;
  details: Record<string, unknown>;
  visible_to_client: boolean;
};

export function rolzoProductionAllowed() {
  const flag = (process.env[PRODUCTION_FLAG] || "").trim().toLowerCase();
  return flag === "1" || flag === "true";
}

export function rolzoProductionBlocked() {
  return process.env.VERCEL_ENV === "production" && !rolzoProductionAllowed();
}

function assertRolzoEnvironment() {
  if (rolzoProductionBlocked()) {
    throw new RolzoError(
      "La commande chauffeur n’est pas ouverte sur la production Travelba.",
      403,
      "vercel_production"
    );
  }
}

function assertRolzoHost(hostname: string) {
  const host = hostname.toLowerCase();
  const staging = host === "staging.rolzo.com";
  const rolzoHost = host === "rolzo.com" || host.endsWith(".rolzo.com");
  if (!rolzoHost) {
    throw new RolzoError("L’adresse ROLZO n’est pas autorisée.", 403, "bad_host");
  }
  if (!staging && !rolzoProductionAllowed()) {
    throw new RolzoError(
      "La clé de test ne s’utilise pas sur l’environnement de production ROLZO.",
      403,
      "production_refused"
    );
  }
}

function parseBase(raw: string, fallback: string) {
  const value = (raw || fallback).trim().replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RolzoError("L’adresse ROLZO est invalide.", 500, "bad_base");
  }
  if (url.protocol !== "https:") {
    throw new RolzoError("L’adresse ROLZO est invalide.", 500, "bad_base");
  }
  assertRolzoHost(url.hostname);
  return url;
}

/** Vide tant que la production n’est pas autorisée explicitement. */
export function rolzoApiKey() {
  if (rolzoProductionBlocked()) return "";
  return (process.env.ROLZO_API_KEY || "").trim();
}

export function rolzoConfigured() {
  return Boolean(rolzoApiKey());
}

export function rolzoApiBase() {
  assertRolzoEnvironment();
  const url = parseBase(process.env.ROLZO_API_BASE || "", ROLZO_STAGING_API_BASE);
  const path = url.pathname.replace(/\/$/, "");
  if (url.hostname === "staging.rolzo.com" && (path === "" || path === "/")) {
    return `${url.origin}/api`;
  }
  return `${url.origin}${path}`;
}

export function rolzoWebHost() {
  assertRolzoEnvironment();
  const url = parseBase(process.env.ROLZO_WEB_HOST || "", ROLZO_STAGING_WEB_HOST);
  return url.origin;
}

export function rolzoExternalUrl(path: string) {
  const base = rolzoApiBase().replace(/\/$/, "");
  const suffix = path.replace(/^\//, "");
  return `${base}/api/v1/external/${suffix}`;
}

export function rolzoReferenceId(reference: string, leg: ExtraLeg) {
  return chauffeurReferenceId(reference, leg);
}

export function legFromRolzoReference(reference: string, value: string | null | undefined): ExtraLeg | null {
  const ref = reference.trim();
  const id = (value || "").trim();
  if (!ref || !id) return null;
  if (id === `${ref}-aller`) return "departure";
  if (id === `${ref}-retour`) return "arrival";
  return null;
}

export function assertRolzoBookingId(value: string) {
  const id = value.trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) {
    throw new RolzoError("La réservation chauffeur est introuvable.", 400, "bad_id");
  }
  return id;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function phoneForRolzo(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw) return null;
  return toE164(raw) || (raw.startsWith("+") ? raw : null);
}

/** Corps de session. Jamais de carte, de CVC, ni de `paymentCredentials`. */
export function rolzoSessionBody(customer: RolzoCustomer, omitEmail = false) {
  const first = customer.first_name.trim();
  const last = customer.last_name.trim();
  if (!first || !last) {
    throw new RolzoError("Le prénom et le nom de la fiche sont nécessaires.", 400, "missing_name");
  }
  const body: Record<string, string> = {
    first_name: first,
    last_name: last,
  };
  const phone = phoneForRolzo(customer.phone);
  if (phone) body.contacts_phone = phone;
  if (!omitEmail) {
    const email = customer.email.trim();
    if (email) body.email_address = email;
  }
  assertNoPaymentFields(body);
  return body;
}

const PAYMENT_KEYS = ["paymentcredentials", "cardnumber", "cvc", "cvv", "pan", "expirationdate"];

export function assertNoPaymentFields(value: unknown) {
  const seen = JSON.stringify(value).toLowerCase();
  if (PAYMENT_KEYS.some((key) => seen.includes(`"${key}"`))) {
    throw new RolzoError("Les données de carte ne partent pas vers ROLZO.", 400, "payment_refused");
  }
}

function codeFrom(value: unknown, depth = 0): number | null {
  if (depth > 4 || value == null) return null;
  if (value === 212 || value === "212") return 212;
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["code", "errorCode", "errCode", "statusCode", "error", "status"]) {
    if (!(key in record)) continue;
    const nested = codeFrom(record[key], depth + 1);
    if (nested === 212) return 212;
  }
  if ("meta" in record) {
    const nested = codeFrom(record.meta, depth + 1);
    if (nested === 212) return 212;
  }
  return null;
}

export function isRolzoEmailTaken(status: number, body: unknown) {
  return status === 212 || codeFrom(body) === 212;
}

function redact(message: string) {
  const key = (process.env.ROLZO_API_KEY || "").trim();
  return key ? message.split(key).join("[redacted]") : message;
}

async function readJson(res: Response) {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { message: raw.slice(0, 300) };
  }
}

export async function openRolzoSession(
  customer: RolzoCustomer,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const key = rolzoApiKey();
  if (!key) {
    throw new RolzoError("La commande chauffeur n’est pas disponible.", 503, "not_configured");
  }
  const first = await requestToken(customer, false, key, fetchImpl);
  if (first.encodedData) return first.encodedData;
  if (first.emailTaken) {
    const second = await requestToken(customer, true, key, fetchImpl);
    if (second.encodedData) return second.encodedData;
    throw second.error || new RolzoError("La session chauffeur n’a pas pu s’ouvrir.", 502, "upstream");
  }
  throw first.error || new RolzoError("La session chauffeur n’a pas pu s’ouvrir.", 502, "upstream");
}

async function requestToken(
  customer: RolzoCustomer,
  omitEmail: boolean,
  key: string,
  fetchImpl: typeof fetch
) {
  const body = rolzoSessionBody(customer, omitEmail);
  let res: Response;
  try {
    res = await fetchImpl(rolzoExternalUrl("api-token"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "réseau";
    return {
      encodedData: null,
      emailTaken: false,
      error: new RolzoError(redact(message).slice(0, 300) || "ROLZO est injoignable.", 502, "network"),
    };
  }
  const json = await readJson(res);
  const encoded = encodedDataOf(json);
  if (res.ok && encoded) return { encodedData: encoded, emailTaken: false, error: null };
  const emailTaken = isRolzoEmailTaken(res.status, json);
  const message = messageOf(json) || "ROLZO a refusé la session.";
  return {
    encodedData: null,
    emailTaken,
    error: new RolzoError(redact(message).slice(0, 300), res.status || 502, emailTaken ? "email_taken" : "upstream"),
  };
}

function encodedDataOf(json: unknown) {
  if (!json || typeof json !== "object") return null;
  const data = (json as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const encoded = (data as { encodedData?: unknown }).encodedData;
  return typeof encoded === "string" && encoded.trim() ? encoded : null;
}

function messageOf(json: unknown) {
  if (!json || typeof json !== "object") return null;
  const record = json as Record<string, unknown>;
  return text(record.message) || text(record.reason) || text(record.error);
}

function unwrapBooking(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return record;
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100) / 100;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return money(record.amount ?? record.value ?? record.total ?? record.price);
  }
  return null;
}

function currencyOf(value: unknown, sibling: Record<string, unknown> | null) {
  const direct = text(value);
  if (direct && /^[A-Za-z]{3}$/.test(direct)) return direct.toUpperCase();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nested = text((value as Record<string, unknown>).currency);
    if (nested && /^[A-Za-z]{3}$/.test(nested)) return nested.toUpperCase();
  }
  const side = sibling ? text(sibling.currency) || text(sibling.currencyCode) : null;
  return side && /^[A-Za-z]{3}$/.test(side) ? side.toUpperCase() : null;
}

function named(value: unknown): string | null {
  const line = text(value);
  if (line) return line;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const full = text(record.fullName) || text(record.name) || text(record.label) || text(record.category);
  if (full) return full;
  const joined = [text(record.firstName) || text(record.first_name), text(record.lastName) || text(record.last_name)]
    .filter(Boolean)
    .join(" ");
  return joined || null;
}

function firstNamed(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (!(key in record)) continue;
    const line = named(record[key]);
    if (line) return line;
  }
  return null;
}

const PRICE_KEYS = ["clientPrice", "sellingPrice", "totalPrice", "grandTotal", "price", "amount", "total"];

function priceOf(record: Record<string, unknown>) {
  for (const key of PRICE_KEYS) {
    if (!(key in record)) continue;
    const value = record[key];
    const amount = money(value);
    if (amount == null) continue;
    return { price: amount, currency: currencyOf(value, record) };
  }
  return { price: null, currency: currencyOf(null, record) };
}

function cancellationOf(record: Record<string, unknown>) {
  const direct =
    text(record.cancellationPolicy) || text(record.cancellation_policy) || text(record.cancellationTerms);
  const block = record.cancellation;
  let policy = direct;
  let fee = money(record.cancellationFee ?? record.cancellation_fee ?? record.cancellationCharges);
  if (!policy && typeof block === "string") policy = text(block);
  if (block && typeof block === "object" && !Array.isArray(block)) {
    const row = block as Record<string, unknown>;
    policy = policy || text(row.policy) || text(row.text) || text(row.description) || text(row.message);
    fee = fee ?? money(row.fee ?? row.charges ?? row.amount ?? row.cancellationFee);
  }
  return { policy, fee };
}

/** Lecture stricte : pas de prix, de véhicule ni de chauffeur inventés. */
export function parseRolzoBooking(payload: unknown, fallbackId: string): RolzoBookingView {
  const record = unwrapBooking(payload);
  const ops =
    record.bookingOperations && typeof record.bookingOperations === "object"
      ? (record.bookingOperations as Record<string, unknown>)
      : null;
  const priced = priceOf(record);
  const cancellation = cancellationOf(record);
  const id =
    text(record.id) || text(record._id) || text(record.bookingId) || fallbackId;
  return {
    id,
    status: text(record.status) || text(record.bookingStatus) || text(record.state),
    vehicle:
      firstNamed(record, ["vehicle", "vehicleName", "vehicleType", "selectedVehicle", "car"]) ||
      (ops ? firstNamed(ops, ["vehicle", "vehicleName"]) : null),
    driver:
      firstNamed(record, ["driver", "chauffeur", "driverName", "chauffeurName"]) ||
      (ops ? firstNamed(ops, ["driver", "chauffeur", "driverName"]) : null),
    price: priced.price,
    currency: priced.currency,
    cancellationPolicy: cancellation.policy,
    cancellationFee: cancellation.fee,
    referenceId: text(record.refrenceId) || text(record.referenceId) || text(record.reference),
  };
}

export function rolzoStatusLabel(status: string | null | undefined) {
  return statusLabel(status);
}

export function cancellationNotice(view: Pick<RolzoBookingView, "cancellationPolicy" | "cancellationFee" | "currency">) {
  const fee =
    view.cancellationFee == null
      ? null
      : view.currency
        ? `${view.cancellationFee.toLocaleString("fr-FR", { style: "currency", currency: view.currency })}`
        : String(view.cancellationFee);
  const parts = [view.cancellationPolicy, fee ? `Frais : ${fee}` : null].filter(Boolean);
  return parts.length ? parts.join(" — ") : null;
}

export function chauffeurItemFields(input: {
  view: RolzoBookingView;
  leg: ExtraLeg;
  place: ServicePlace;
  startAt: string | null;
  visibleToClient: boolean;
}): ChauffeurItemFields {
  const view = input.view;
  const details: Record<string, unknown> = {
    service_leg: input.leg,
    place: input.place,
    moment: null,
    extra: true,
    agency_status: "confirmed",
    rolzo: true,
    rolzo_id: view.id,
    rolzo_status: view.status,
    vehicle: view.vehicle,
    driver: view.driver,
    price: view.price,
    currency: view.currency,
    cancellation_policy: view.cancellationPolicy,
    cancellation_fee: view.cancellationFee,
    pickup: null,
  };
  assertNoPaymentFields(details);
  return {
    kind: "chauffeur",
    title: input.leg === "departure" ? "Transfert aller" : "Transfert retour",
    supplier: "ROLZO",
    confirmation_ref: view.id,
    start_at: input.startAt,
    end_at: null,
    amount: view.price,
    include_in_ledger: true,
    details,
    visible_to_client: input.visibleToClient,
  };
}

export async function fetchRolzoBooking(bookingId: string, fetchImpl: typeof fetch = fetch) {
  const id = assertRolzoBookingId(bookingId);
  const key = rolzoApiKey();
  if (!key) throw new RolzoError("La commande chauffeur n’est pas disponible.", 503, "not_configured");
  const res = await fetchImpl(rolzoExternalUrl(`booking/multi-stops/${encodeURIComponent(id)}`), {
    method: "GET",
    headers: { "x-api-key": key, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const json = await readJson(res);
  if (!res.ok) {
    throw new RolzoError(redact(messageOf(json) || "ROLZO n’a pas renvoyé la course.").slice(0, 300), res.status, "upstream");
  }
  return parseRolzoBooking(json, id);
}

export async function cancelRolzoBooking(bookingId: string, fetchImpl: typeof fetch = fetch) {
  const id = assertRolzoBookingId(bookingId);
  const key = rolzoApiKey();
  if (!key) throw new RolzoError("La commande chauffeur n’est pas disponible.", 503, "not_configured");
  const res = await fetchImpl(rolzoExternalUrl(`booking/multi-stops/${encodeURIComponent(id)}/cancel`), {
    method: "PATCH",
    headers: { "x-api-key": key, accept: "application/json", "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(20_000),
  });
  const json = await readJson(res);
  if (!res.ok) {
    throw new RolzoError(redact(messageOf(json) || "ROLZO n’a pas annulé la course.").slice(0, 300), res.status, "upstream");
  }
  return parseRolzoBooking(json, id);
}
