import { publicHotelGallery } from "./hotel-gallery";
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
/** La couverture catalogue ne retarde pas toute la ville : le reste garde la photo déjà reçue. */
const COVER_BUDGET_MS = 8_000;

async function withCatalogCovers(offers: HotelOffer[], fetchImpl?: typeof fetch) {
  const ids = [...new Set(offers.map((offer) => offer.hotelId).filter((id): id is number => typeof id === "number" && id > 0))];
  const covers = new Map<number, string>();
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor];
      cursor += 1;
      const urls = await publicHotelGallery(id, fetchImpl);
      if (urls[0]) covers.set(id, urls[0]);
    }
  }
  const work = Promise.all([worker(), worker(), worker(), worker()]);
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, COVER_BUDGET_MS);
    work.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      }
    );
  });
  if (!covers.size) return offers;
  return offers.map((offer) => {
    const cover = offer.hotelId ? covers.get(offer.hotelId) : "";
    if (!cover) return offer;
    return { ...offer, photoUrl: cover, thumbUrl: cover };
  });
}

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
  timeoutMs?: number;
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
        signal: AbortSignal.timeout(input.timeoutMs ?? SEARCH_TIMEOUT_MS),
      },
      input.fetchImpl
    );
    return withCatalogCovers(offersFromLeAvailability(payload, input.city || input.destination), input.fetchImpl);
  } catch (err) {
    console.error("[hotels] disponibilités", failureCode(err));
    throw new Error("supplier");
  }
}

/** Hôtels déjà connus : une disponibilité par hôtel, pour ne pas attendre toute la ville. */
export async function loadKnownHotelOffers(input: {
  destination: string;
  city?: string;
  checkIn: string;
  checkOut: string;
  rooms: HotelRoomOccupancy[];
  hotelIds: number[];
  fetchImpl?: typeof fetch;
}): Promise<HotelOffer[]> {
  const ids = [...new Set(input.hotelIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 8);
  const offers: HotelOffer[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor];
      cursor += 1;
      try {
        const rows = await loadLittleEmperorsOffers({
          destination: input.destination,
          city: input.city,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          rooms: input.rooms,
          target: { kind: "hotel", id },
          timeoutMs: 12_000,
          fetchImpl: input.fetchImpl,
        });
        offers.push(...rows);
      } catch {
        /* un hôtel en échec laisse les autres */
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return offers;
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
    const profile = profileFromLeHotel(hotel);
    const gallery = await publicHotelGallery(input.hotelId, input.fetchImpl);
    if (gallery.length) profile.images = gallery;
    return { offers: offersFromLeAvailability(availability, ""), profile };
  } catch (err) {
    console.error("[hotels] fiche", failureCode(err));
    return null;
  }
}
