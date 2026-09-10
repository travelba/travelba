import dns from "node:dns";
import type {
  MtripAccountsResponse,
  MtripCreateTravelerPayload,
  MtripHealthResponse,
  MtripInventory,
  MtripMobileAppLinkResponse,
  MtripTrip,
  MtripTripIdCheckResponse,
} from "./types";

// CloudFront mTrip résout en IPv6 cassé sur certains réseaux Windows → ECONNRESET.
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Node < 17
}

export class MtripError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "MtripError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Environments (from mTrip docs):
 * - Sandbox: https://sandbox.mtrip.com
 * - Production USA: https://api.mtrip.com
 * - Production Europe: https://api1.mtrip.com
 *
 * Auth: HTTP Basic — Base64(ID:API_KEY)
 */
function getConfig() {
  const baseUrl =
    process.env.MTRIP_API_URL || "https://api.mtrip.com";
  const apiId = process.env.MTRIP_API_ID;
  const apiKey = process.env.MTRIP_API_KEY;

  if (!apiId || !apiKey) {
    throw new MtripError(
      "MTRIP_API_ID / MTRIP_API_KEY manquants. Ajoutez-les dans .env.local.",
      500
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiId,
    apiKey,
  };
}

function basicAuthHeader(apiId: string, apiKey: string) {
  const credentials = Buffer.from(`${apiId}:${apiKey}`, "utf8").toString(
    "base64"
  );
  return `Basic ${credentials}`;
}

async function mtripFetch<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> }
): Promise<T> {
  const { baseUrl, apiId, apiKey } = getConfig();
  const url = new URL(`${baseUrl}${path}`);

  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const { query: _query, ...rest } = init || {};
  const response = await fetch(url.toString(), {
    ...rest,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(apiId, apiKey),
      ...(rest.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `mTrip API error (${response.status})`;
    throw new MtripError(message, response.status, body);
  }

  return body as T;
}

/** Public health check — no auth required. */
export async function getHealth(baseUrl?: string) {
  const url = `${(baseUrl || process.env.MTRIP_API_URL || "https://api.mtrip.com").replace(/\/$/, "")}/v1/health`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as MtripHealthResponse | null;
  if (!response.ok) {
    throw new MtripError("mTrip health check failed", response.status, body);
  }
  return body as MtripHealthResponse;
}

export async function listAccounts() {
  return mtripFetch<MtripAccountsResponse>("/v1/accounts");
}

/** Create or fully replace a trip (push full itinerary again to update). */
export async function upsertTrip(trip: MtripTrip) {
  return mtripFetch<unknown>("/v1/trips", {
    method: "POST",
    body: JSON.stringify(trip),
  });
}

/** Delete trip(s) by identifier. */
export async function deleteTrips(identifiers: string[]) {
  return mtripFetch<unknown>("/v1/trips", {
    method: "DELETE",
    body: JSON.stringify(identifiers.map((identifier) => ({ identifier }))),
  });
}

/** Returns { trip_id } if found, 404 if unknown. */
export async function checkTripIdentifier(identifier: string) {
  return mtripFetch<MtripTripIdCheckResponse>("/v1/trips/internal_identifier", {
    method: "GET",
    query: { identifier },
  });
}

export async function createTraveler(payload: MtripCreateTravelerPayload | MtripCreateTravelerPayload[]) {
  const body = Array.isArray(payload) ? payload : [payload];
  return mtripFetch<unknown>("/v1/travelers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteTravelers(
  travelers: Array<{ identifier: string; trip_identifier?: string }>
) {
  return mtripFetch<unknown>("/v1/travelers", {
    method: "DELETE",
    body: JSON.stringify(travelers),
  });
}

/**
 * Mobile app download link for a traveler on a trip.
 * Query params: user_identifier + trip_identifier
 */
export async function getMobileAppLink(params: {
  user_identifier: string;
  trip_identifier: string;
}) {
  return mtripFetch<MtripMobileAppLinkResponse>(
    "/v1/travelers/mobile_app_link",
    {
      method: "GET",
      query: params,
    }
  );
}

export async function createExternalBooking(payload: unknown) {
  return mtripFetch<unknown>("/v1/external_bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listInventories() {
  return mtripFetch<unknown>("/v1/inventories");
}

export async function upsertInventory(payload: MtripInventory) {
  return mtripFetch<unknown>("/v1/inventories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
