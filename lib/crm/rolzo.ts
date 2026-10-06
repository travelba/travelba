/** Client Rolzo (serveur). La clé reste dans l’environnement, jamais dans le navigateur. */

export const ROLZO_STAGING_BASE = "https://staging.rolzo.com/api/api/v1/external";
export const ROLZO_PRODUCTION_BASE = "https://rates.rolzo.com/api/v1/external";

export class RolzoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RolzoError";
  }
}

export type RolzoPlace = {
  city: string;
  country: string;
  lat: number;
  lng: number;
  fullAddress: string;
  state: string;
};

export type RolzoVehicleQuote = {
  rateId: string;
  amount: number;
  currency: string;
  label: string;
  passengers: number;
  luggage: number;
  category: string;
  commissionPercent: number;
  cancellationHours: number | null;
  freeWaiting: string | null;
  /** Multiplicateurs depuis la devise du tarif (`to_eur`, `to_usd`…). */
  fx: Record<string, number>;
};

export type RolzoPaymentMode = "deferredPayment" | "standardPayment" | "deferredPaymentCard" | "unknown";

type FetchImpl = typeof fetch;

export function rolzoApiBase() {
  const configured = process.env.ROLZO_API_BASE?.trim();
  return (configured || ROLZO_STAGING_BASE).replace(/\/$/, "");
}

export function rolzoConfigured() {
  return Boolean(process.env.ROLZO_API_KEY?.trim());
}

/** « 2026-12-20T10:00:00 » → « 20/12/2026,10:00 AM », heure murale, sans fuseau. */
export function rolzoPickUpDate(iso: string | null | undefined) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[4]);
  if (!Number.isFinite(hour) || hour > 23) return null;
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${match[3]}/${match[2]}/${match[1]},${h12}:${match[5]} ${suffix}`;
}

export function rolzoPaymentMode(payload: unknown): RolzoPaymentMode {
  const data = recordOf(payload)?.data ?? payload;
  const rows = recordOf(data)?.paymentType;
  if (!Array.isArray(rows)) return "unknown";
  const active = rows.find((row) => recordOf(row)?.key === true);
  const label = String(recordOf(active)?.label || "");
  if (label === "deferredPayment" || label === "standardPayment" || label === "deferredPaymentCard") {
    return label;
  }
  return "unknown";
}

/** Facturation mensuelle : réserver sans numéro de carte. */
export function rolzoBooksWithoutCard(payload: unknown) {
  return rolzoPaymentMode(payload) === "deferredPayment";
}

export function parseCancellationHours(value: unknown) {
  const match = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*hour/i);
  if (!match) return null;
  const hours = Number(match[1].replace(",", "."));
  return Number.isFinite(hours) ? hours : null;
}

export function parseRolzoRates(payload: unknown): RolzoVehicleQuote[] {
  const data = recordOf(payload)?.data ?? payload;
  const rows = Array.isArray(data) ? data : [];
  const quotes: RolzoVehicleQuote[] = [];
  for (const row of rows) {
    const item = recordOf(row);
    if (!item) continue;
    const vehicle = recordOf(item.vehicle);
    const rateId = text(item.rateId);
    const amount = Number(item.rate);
    const currency = text(item.currency).toUpperCase();
    if (!rateId || !Number.isFinite(amount) || amount <= 0 || !currency) continue;
    const benefits = recordOf(item.benefits);
    const policy = recordOf(item.cancellationPolicy);
    const fx: Record<string, number> = {};
    const currencies = recordOf(item.currencies);
    if (currencies) {
      for (const [key, value] of Object.entries(currencies)) {
        const rate = Number(value);
        if (key.startsWith("to_") && Number.isFinite(rate) && rate > 0) fx[key.slice(3).toUpperCase()] = rate;
      }
    }
    quotes.push({
      rateId,
      amount,
      currency,
      label: text(vehicle?.label) || "Véhicule",
      passengers: Math.max(0, Math.floor(Number(vehicle?.passenger) || 0)),
      luggage: Math.max(0, Math.floor(Number(vehicle?.luggage) || 0)),
      category: text(vehicle?.categoryChauffeured),
      commissionPercent: Number(benefits?.commissionWeight) || 0,
      cancellationHours: parseCancellationHours(policy?.cancellation),
      freeWaiting: text(policy?.freeWaitingTime) || null,
      fx,
    });
  }
  return quotes.sort((a, b) => a.amount - b.amount);
}

/** Prix client dans la devise du dossier. La commission Rolzo ne se soustrait pas. */
export function quoteAmountIn(quote: RolzoVehicleQuote, currency: string) {
  const wanted = currency.trim().toUpperCase();
  if (!wanted || wanted === quote.currency) return quote.amount;
  const fx = quote.fx[wanted];
  if (!fx) return null;
  return Math.round(quote.amount * fx * 100) / 100;
}

export function rolzoBookingId(payload: unknown) {
  const data = recordOf(payload)?.data ?? payload;
  const roots = [data, recordOf(data)?.booking, Array.isArray(data) ? data[0] : null];
  for (const root of roots) {
    const row = recordOf(root);
    const id = text(row?.bookingId) || text(row?.id) || text(row?._id);
    if (id) return id;
  }
  return null;
}

export function frenchRolzoFailure(payload: unknown, status: number) {
  const data = recordOf(payload)?.data ?? payload;
  const row = recordOf(data) || recordOf(payload);
  const code = Number(row?.code ?? recordOf(payload)?.code ?? recordOf(recordOf(payload)?.meta)?.code);
  if (code === 202) return "Aucun véhicule pour ce trajet.";
  if (code === 203) return "Ce tarif a expiré. Choisissez à nouveau un véhicule.";
  if (code === 204) return "Ce tarif a déjà été réservé. Choisissez à nouveau un véhicule.";
  if (code === 207) return "Le départ est trop proche pour Rolzo. Écrivez-nous sur WhatsApp.";
  if (code === 208) return "L’annulation Rolzo est déjà en cours.";
  if (code === 211) return "La clé Rolzo n’est pas reconnue.";
  if (status === 401 || status === 403) return "La clé Rolzo n’est pas reconnue.";
  return "Rolzo n’a pas répondu. Réessayez.";
}

export async function rolzoRequest(
  path: string,
  init: { method: string; body?: unknown },
  fetchImpl: FetchImpl = fetch
) {
  const key = process.env.ROLZO_API_KEY?.trim();
  if (!key) throw new RolzoError("Le devis chauffeur n’est pas ouvert.");
  const url = `${rolzoApiBase()}/${path.replace(/^\//, "")}`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: init.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": key,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new RolzoError("Rolzo n’a pas répondu. Réessayez.");
  }
  const json = await response.json().catch(() => null);
  const metaOk = recordOf(json)?.meta ? recordOf(recordOf(json)?.meta)?.success !== false : true;
  if (!response.ok || !metaOk) throw new RolzoError(frenchRolzoFailure(json, response.status));
  return json;
}

export async function rolzoAccount(fetchImpl: FetchImpl = fetch) {
  const json = await rolzoRequest("getUserDetail", { method: "GET" }, fetchImpl);
  return { mode: rolzoPaymentMode(json), booksWithoutCard: rolzoBooksWithoutCard(json) };
}

export async function rolzoTransferRates(
  input: { from: RolzoPlace; to: RolzoPlace; pickUpDate: string },
  fetchImpl: FetchImpl = fetch
) {
  const json = await rolzoRequest(
    "rates/multiStops-transfer",
    {
      method: "POST",
      body: {
        from: placeBody(input.from),
        to: placeBody(input.to),
        pickUpDate: input.pickUpDate,
      },
    },
    fetchImpl
  );
  return parseRolzoRates(json);
}

export async function rolzoCreateBooking(
  body: Record<string, unknown>,
  fetchImpl: FetchImpl = fetch
) {
  const json = await rolzoRequest("booking/create", { method: "POST", body }, fetchImpl);
  const id = rolzoBookingId(json);
  if (!id) throw new RolzoError("Rolzo n’a pas renvoyé de réservation.");
  return id;
}

export async function rolzoCancelBooking(bookingId: string, fetchImpl: FetchImpl = fetch) {
  await rolzoRequest(`booking/multi-stops/${encodeURIComponent(bookingId)}/cancel`, {
    method: "PATCH",
    body: {},
  }, fetchImpl);
}

function placeBody(place: RolzoPlace) {
  return {
    city: place.city,
    country: place.country,
    lat: place.lat,
    lng: place.lng,
    fullAddress: place.fullAddress,
    state: place.state,
  };
}

function recordOf(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
