import "server-only";

import { supplierRoomOccupancy, type HotelRoomOccupancy } from "@/lib/crm/hotel-search";
import { amountToCents } from "@/lib/crm/money";
import {
  etaHour,
  leBookingRequest,
  leCreditCard,
  leSessionExpired,
  redactCardText,
} from "@/lib/crm/le-self-book";
import { offersFromLeAvailability } from "@/lib/crm/little-emperors-availability";
import {
  createLittleEmperorsBooking,
  LittleEmperorsError,
  littleEmperorsJson,
  type LeBooking,
} from "@/lib/crm/little-emperors";

export type LeFreshQuote = {
  sellCents: number;
  currency: string;
  sessionId: string;
  rateIndex: string;
  deadline: string | null;
  requiresCvc: boolean | null;
  paymentDescription: string | null;
  cancellation: string;
  free: boolean;
};

type OfferShape = {
  sessionId?: string | null;
  rateIndex?: string | null;
  rateKey?: string;
  roomKey?: string;
  cancellationDeadline?: string | null;
  requiresCvc?: boolean | null;
  paymentDescription?: string | null;
  cancellation?: string;
  freeCancellation?: boolean;
  proposed?: number | null;
  currency?: string | null;
};

function quoteFromOffer(offer: OfferShape): LeFreshQuote | null {
  const proposed = Number(offer.proposed);
  const sellCents = amountToCents(proposed);
  const sessionId = (offer.sessionId || "").trim();
  const rateIndex = (offer.rateIndex || offer.rateKey || "").trim();
  if (!(sellCents > 0) || !sessionId || !rateIndex) return null;
  const currency = (offer.currency || "EUR").toUpperCase();
  return {
    sellCents,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "EUR",
    sessionId,
    rateIndex,
    deadline: offer.cancellationDeadline || null,
    requiresCvc: offer.requiresCvc ?? null,
    paymentDescription: offer.paymentDescription || null,
    cancellation: offer.cancellation || "",
    free: offer.freeCancellation === true,
  };
}

/** Relit la disponibilité de cet hôtel et reprend le même tarif, même si le prix a bougé. */
export async function refreshLeOfferQuote(input: {
  hotelId: number;
  checkIn: string;
  checkOut: string;
  rooms: HotelRoomOccupancy[];
  rateKey: string;
  rateIndex: string | null;
  roomKey: string;
  fetchImpl?: typeof fetch;
}): Promise<LeFreshQuote | null> {
  const payload = await littleEmperorsJson(
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
      signal: AbortSignal.timeout(25_000),
    },
    input.fetchImpl
  );
  const offers = offersFromLeAvailability(payload, "");
  const index = (input.rateIndex || "").trim();
  const key = input.rateKey.trim();
  const room = input.roomKey.trim();
  const match =
    offers.find((offer) => (index && offer.rateIndex === index) || (key && offer.rateKey === key)) ||
    offers.find((offer) => room && offer.roomKey === room && (offer.rateIndex || offer.rateKey));
  return match ? quoteFromOffer(match) : null;
}

export async function submitLeBooking(input: {
  quote: LeFreshQuote;
  checkIn: string;
  checkOut: string;
  hotelId: number;
  guestName: string;
  guestEmail: string;
  arrival: string | null;
  rooms: { guestName: string; adults: number; children: { age: number }[] }[];
  card: { pan: string; cvc: string; expMonth: number; expYear: number; name: string } | null;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; booking: LeBooking } | { ok: false; expired: boolean }> {
  const credit = input.card ? leCreditCard({ ...input.card, requiresCvc: input.quote.requiresCvc }) : null;
  if (input.card && !credit) return { ok: false, expired: false };
  const body = leBookingRequest({
    start: input.checkIn,
    end: input.checkOut,
    sessionId: input.quote.sessionId,
    rateIndex: input.quote.rateIndex,
    hotelId: input.hotelId,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    eta: etaHour(input.arrival),
    rooms: input.rooms,
    card: credit,
  });
  try {
    const booking = await createLittleEmperorsBooking(body, input.fetchImpl);
    return { ok: true, booking };
  } catch (err) {
    const message = err instanceof Error ? redactCardText(err.message) : "";
    const code = err instanceof LittleEmperorsError ? err.code : "error";
    console.error("[hotels] réservation", code);
    return { ok: false, expired: leSessionExpired(message) };
  }
}
