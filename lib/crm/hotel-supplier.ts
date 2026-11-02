/**
 * Couche fournisseur. Le parcours appelle ce port, jamais un endpoint en dur.
 * L’e-mail à l’hôtel est la première implémentation. Little Emperors se branche
 * ici le jour où l’endpoint de création existe, sans changer l’écran client.
 */

export type BookQuote = {
  idempotencyKey: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  sellCents: number;
  currency: string;
  expiresAt: string;
  partnerRate: boolean;
};

export type Recheck =
  | { ok: true; sellCents: number; currency: string }
  | { ok: false; reason: "expired" | "unavailable" | "price_changed" | "not_contracted" };

export type BookOutcome =
  | { status: "requested"; channel: "email" }
  | { status: "confirmed"; channel: "api"; confirmationNumber: string }
  | { status: "unavailable"; reason: "not_contracted" | "refused" | "error" };

export type CancelOutcome =
  | { status: "requested"; channel: "email" }
  | { status: "cancelled"; channel: "api" }
  | { status: "unavailable"; reason: string };

export type HotelBookPort = {
  kind: "direct_email" | "little_emperors";
  /** Faux tant que l’endpoint de création n’est pas contracté. */
  available: boolean;
  recheck(quote: BookQuote, nowIso: string): Recheck;
  book(quote: BookQuote): BookOutcome;
  cancel(input: { idempotencyKey: string; confirmation: string | null; paid: boolean }): CancelOutcome;
};

function fresh(quote: BookQuote, nowIso: string): boolean {
  const expiry = Date.parse(quote.expiresAt);
  const now = Date.parse(nowIso);
  return Number.isFinite(expiry) && Number.isFinite(now) && expiry > now && quote.sellCents > 0;
}

/** Réservation directe : pas d’appel fournisseur. Le tarif cité est revérifié sur sa durée. */
export function directEmailPort(): HotelBookPort {
  return {
    kind: "direct_email",
    available: true,
    recheck(quote, nowIso) {
      if (!fresh(quote, nowIso)) return { ok: false, reason: "expired" };
      return { ok: true, sellCents: quote.sellCents, currency: quote.currency };
    },
    book() {
      return { status: "requested", channel: "email" };
    },
    cancel() {
      return { status: "requested", channel: "email" };
    },
  };
}

/**
 * Port Little Emperors. Tant que `endpointConfigured` est faux, rien n’est créé :
 * le parcours reste sur l’e-mail. Aucun POST n’est inventé.
 */
export function littleEmperorsPort(endpointConfigured: boolean): HotelBookPort {
  return {
    kind: "little_emperors",
    available: endpointConfigured,
    recheck(quote, nowIso) {
      if (!endpointConfigured) return { ok: false, reason: "not_contracted" };
      if (!fresh(quote, nowIso)) return { ok: false, reason: "expired" };
      return { ok: true, sellCents: quote.sellCents, currency: quote.currency };
    },
    book() {
      if (!endpointConfigured) return { status: "unavailable", reason: "not_contracted" };
      return { status: "unavailable", reason: "not_contracted" };
    },
    cancel() {
      if (!endpointConfigured) return { status: "unavailable", reason: "not_contracted" };
      return { status: "unavailable", reason: "not_contracted" };
    },
  };
}

/** Aujourd’hui : toujours l’e-mail. Le port membre ne prend le relais que s’il est disponible. */
export function portForBooking(input: { partnerRate: boolean; leEndpoint: boolean }): HotelBookPort {
  const member = littleEmperorsPort(input.leEndpoint);
  if (input.partnerRate && member.available) return member;
  return directEmailPort();
}
