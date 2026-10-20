import "server-only";
import { ECB_SNAPSHOT, HOTEL_FX_SNAPSHOT, parseEcbBoard, parseEcbRates, parseFrankfurterRates, type EurFx } from "./visa-fees";

const ECB_TIMEOUT_MS = 5_000;
const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?from=EUR";
const FX_TTL_MS = 6 * 60 * 60 * 1000;

let fxMemory: { at: number; rates: Record<string, number> } | null = null;

export async function euroRates(fetchImpl: typeof fetch = fetch): Promise<{ date: string; rates: EurFx; live: boolean }> {
  try {
    const res = await fetchImpl(ECB_DAILY_URL, {
      signal: AbortSignal.timeout(ECB_TIMEOUT_MS),
    });
    if (!res.ok) return { ...ECB_SNAPSHOT, live: false };
    const parsed = parseEcbRates(await res.text());
    if (!parsed) return { ...ECB_SNAPSHOT, live: false };
    return { ...parsed, live: true };
  } catch {
    return { ...ECB_SNAPSHOT, live: false };
  }
}

/** Cours BCE (unités pour 1 euro). Flux du jour, puis Frankfurter, puis le cliché. */
export async function pliantReferenceRates(fetchImpl: typeof fetch = fetch): Promise<Record<string, number>> {
  const now = Date.now();
  if (fxMemory && now - fxMemory.at < FX_TTL_MS) return fxMemory.rates;
  const rates = (await livePliantRates(fetchImpl)) || HOTEL_FX_SNAPSHOT.rates;
  fxMemory = { at: now, rates };
  return rates;
}

async function livePliantRates(fetchImpl: typeof fetch) {
  try {
    const res = await fetchImpl(ECB_DAILY_URL, { signal: AbortSignal.timeout(ECB_TIMEOUT_MS) });
    if (res.ok) {
      const parsed = parseEcbBoard(await res.text());
      if (parsed) return parsed.rates;
    }
  } catch {
    // Le second flux reprend.
  }
  try {
    const res = await fetchImpl(FRANKFURTER_URL, { signal: AbortSignal.timeout(ECB_TIMEOUT_MS) });
    if (!res.ok) return null;
    return parseFrankfurterRates(await res.json());
  } catch {
    return null;
  }
}
