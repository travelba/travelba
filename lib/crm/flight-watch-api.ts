import "server-only";

import { productionOnlySecret } from "./preview-secrets";
import { aeroFlightUrl, parseAeroFlights, type AeroFetchResult } from "./flight-watch";

export function aeroApiKey() {
  return productionOnlySecret(process.env.AEROAPI_KEY);
}

export function flightNoticeSid(kind: "horaire" | "annule" | "enregistrement") {
  const name =
    kind === "horaire"
      ? "TWILIO_CONTENT_VOL_HORAIRE"
      : kind === "annule"
        ? "TWILIO_CONTENT_VOL_ANNULE"
        : "TWILIO_CONTENT_VOL_ENREGISTREMENT";
  return productionOnlySecret(process.env[name]);
}

export async function fetchAeroFlights(
  ident: string,
  now: Date,
  fetchImpl: typeof fetch = fetch
): Promise<AeroFetchResult> {
  const key = aeroApiKey();
  if (!key) return { ok: false, stop: true, status: 0, flights: [] };
  let response: Response;
  try {
    response = await fetchImpl(aeroFlightUrl(ident, now), {
      headers: { "x-apikey": key, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, stop: true, status: 0, flights: [] };
  }
  if (response.status === 401 || response.status === 402 || response.status === 403 || response.status === 429) {
    return { ok: false, stop: true, status: response.status, flights: [] };
  }
  if (!response.ok) return { ok: false, stop: false, status: response.status, flights: [] };
  const payload = await response.json().catch(() => null);
  return { ok: true, stop: false, status: response.status, flights: parseAeroFlights(payload) };
}
