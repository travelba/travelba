import { littleEmperorsPort, type BookQuote } from "@/lib/crm/hotel-supplier";
import type { BookInput, BookResult, CancelInput, CancelResult, PriceCheckResult } from "./types";

function quoteOf(input: BookInput): BookQuote {
  return {
    idempotencyKey: input.idempotencyKey,
    hotelName: input.hotelName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    sellCents: input.sellCents,
    currency: input.currency,
    expiresAt: input.expiresAt,
    partnerRate: input.partnerRate,
  };
}

/** Mêmes issues que `littleEmperorsPort`. L’orchestrateur de réservation n’est pas déplacé. */
export function littleEmperorsPriceCheck(endpointConfigured: boolean, input: BookInput, nowIso: string): PriceCheckResult {
  return littleEmperorsPort(endpointConfigured).recheck(quoteOf(input), nowIso);
}

export function littleEmperorsBook(endpointConfigured: boolean, input: BookInput): BookResult {
  const outcome = littleEmperorsPort(endpointConfigured).book(quoteOf(input));
  if (outcome.status === "unavailable" && outcome.reason === "not_contracted") {
    return { ok: false, reason: "not_contracted" };
  }
  return { ok: true, outcome };
}

export function littleEmperorsCancel(endpointConfigured: boolean, input: CancelInput): CancelResult {
  const outcome = littleEmperorsPort(endpointConfigured).cancel(input);
  if (outcome.status === "unavailable") return { ok: false, reason: "not_contracted" };
  return { ok: true, outcome };
}

export function expediaNotOpenBook(): BookResult {
  return { ok: false, reason: "not_open" };
}

export function expediaNotOpenCancel(): CancelResult {
  return { ok: false, reason: "not_open" };
}

export function expediaNotOpenPriceCheck(): PriceCheckResult {
  return { ok: false, reason: "not_open" };
}
