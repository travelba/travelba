import { littleEmperorsConfigured, littleEmperorsJson, LittleEmperorsError } from "./little-emperors";
import { offersFromLeAvailability, parseLePredictive, pickLeSearchTarget, type LeSearchHit } from "./little-emperors-availability";
import { supplierRoomOccupancy, type HotelOffer, type HotelRoomOccupancy, type HotelSearchTarget, type PlaceSuggestion } from "./hotel-search";

const SEARCH_TIMEOUT_MS = 8000;
const SUGGEST_TIMEOUT_MS = 2500;

function failureCode(err: unknown) {
  return err instanceof LittleEmperorsError ? err.code : "error";
}

async function predictive(query: string, fetchImpl: typeof fetch | undefined, timeoutMs: number): Promise<LeSearchHit[]> {
  const params = new URLSearchParams({ query, limit: "8" });
  params.append("types[]", "location");
  params.append("types[]", "hotel");
  const payload = await littleEmperorsJson(
    `/v2/search?${params.toString()}`,
    { method: "GET", signal: AbortSignal.timeout(timeoutMs) },
    fetchImpl
  );
  return parseLePredictive(payload);
}

export async function loadLittleEmperorsSuggestions(query: string, fetchImpl?: typeof fetch): Promise<PlaceSuggestion[]> {
  if (!littleEmperorsConfigured()) return [];
  try {
    const hits = await predictive(query, fetchImpl, SUGGEST_TIMEOUT_MS);
    return hits.map((hit) => ({
      label: hit.text,
      kind: hit.type === "hotel" ? ("hotel" as const) : ("ville" as const),
      detail: hit.type === "hotel" ? hit.location.split(",")[0]?.trim() || "" : "",
      id: hit.id,
    }));
  } catch (err) {
    console.error("[hotels] suggestions", failureCode(err));
    return [];
  }
}

export async function loadLittleEmperorsOffers(input: {
  destination: string;
  city?: string;
  checkIn: string;
  checkOut: string;
  rooms: HotelRoomOccupancy[];
  target?: HotelSearchTarget | null;
  fetchImpl?: typeof fetch;
}): Promise<HotelOffer[]> {
  if (!littleEmperorsConfigured()) return [];
  try {
    let target = input.target ?? null;
    if (!target) {
      const hits = await predictive(input.destination, input.fetchImpl, SUGGEST_TIMEOUT_MS);
      const picked = pickLeSearchTarget(hits, input.destination);
      target = picked ? { kind: picked.kind === "hotel" ? "hotel" : "ville", id: picked.id } : null;
    }
    if (!target) return [];
    const payload = await littleEmperorsJson(
      "/v2/hotels/availability",
      {
        method: "POST",
        body: JSON.stringify({
          start_date: input.checkIn,
          end_date: input.checkOut,
          currency: "EUR",
          ...(target.kind === "hotel" ? { hotel_id: target.id } : { location_id: target.id }),
          rooms: supplierRoomOccupancy(input.rooms),
        }),
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      },
      input.fetchImpl
    );
    return offersFromLeAvailability(payload, input.city || input.destination);
  } catch (err) {
    console.error("[hotels] disponibilités", failureCode(err));
    return [];
  }
}
