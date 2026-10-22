import { littleEmperorsConfigured, littleEmperorsJson, LittleEmperorsError } from "./little-emperors";
import {
  offersFromLeAvailability,
  parseLePredictive,
  pickLeSearchTarget,
  profileFromLeHotel,
  type LeHotelProfile,
  type LeSearchHit,
} from "./little-emperors-availability";
import { supplierRoomOccupancy, type HotelOffer, type HotelRoomOccupancy, type HotelSearchTarget, type PlaceSuggestion } from "./hotel-search";

const SEARCH_TIMEOUT_MS = 25_000;
const SUGGEST_TIMEOUT_MS = 8_000;

function failureCode(err: unknown) {
  if (err instanceof LittleEmperorsError) return err.code;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "timeout";
  if (err instanceof Error && err.name === "TypeError") return "type";
  return "error";
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

export async function loadLittleEmperorsSuggestions(
  query: string,
  fetchImpl?: typeof fetch
): Promise<PlaceSuggestion[] | null> {
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
    return null;
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
    throw new Error("supplier");
  }
}

export async function loadLittleEmperorsHotelFile(input: {
  hotelId: number;
  checkIn: string;
  checkOut: string;
  rooms: HotelRoomOccupancy[];
  fetchImpl?: typeof fetch;
}): Promise<{ offers: HotelOffer[]; profile: LeHotelProfile } | null> {
  if (!littleEmperorsConfigured()) return null;
  try {
    const [availability, hotel] = await Promise.all([
      littleEmperorsJson(
        "/v2/hotels/availability",
        {
          method: "POST",
          body: JSON.stringify({
            start_date: input.checkIn,
            end_date: input.checkOut,
            currency: "EUR",
            hotel_id: input.hotelId,
            rooms: supplierRoomOccupancy(input.rooms),
          }),
          signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
        },
        input.fetchImpl
      ),
      littleEmperorsJson(`/v2/hotels/${input.hotelId}`, { method: "GET", signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) }, input.fetchImpl).catch(
        () => null
      ),
    ]);
    return { offers: offersFromLeAvailability(availability, ""), profile: profileFromLeHotel(hotel) };
  } catch (err) {
    console.error("[hotels] fiche", failureCode(err));
    return null;
  }
}
