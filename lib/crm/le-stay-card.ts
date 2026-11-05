import { bookingCardValidity } from "@/lib/crm/manual-stay-card";

export type StayCardDraft = {
  booking_id: string;
  pliant_card_id: string;
  label: string;
  first_name: string;
  last_name: string;
  limit_cents: number;
  transaction_limit_cents: number;
  max_transaction_count: null;
  currency: string;
  status: "active" | "locked";
  last4: string | null;
  valid_from: string;
  valid_to: string;
};

/** Ligne `crm_booking_cards`. `valid_from` et `valid_to` sont obligatoires : sans eux l’insert est refusé. */
export function stayBookingCardInsert(input: {
  bookingId: string;
  pliantCardId: string;
  hotelName: string;
  sellCents: number;
  endDate?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  last4?: string | null;
  today: string;
  locked?: boolean;
}): StayCardDraft | null {
  const pliantCardId = input.pliantCardId.replace(/\s+/g, "").trim();
  const bookingId = input.bookingId.trim();
  if (!pliantCardId || !bookingId || pliantCardId.length > 80) return null;
  const cents = Number.isFinite(input.sellCents) && input.sellCents > 0 ? Math.round(input.sellCents) : 1;
  const window = bookingCardValidity(input.today, input.endDate);
  const last4 = input.last4 && /^\d{4}$/.test(input.last4) ? input.last4 : null;
  const label = (input.hotelName || "Hôtel").replace(/\s+/g, " ").trim().slice(0, 40) || "Hôtel";
  return {
    booking_id: bookingId,
    pliant_card_id: pliantCardId,
    label,
    first_name: (input.firstName || "").trim().slice(0, 80),
    last_name: (input.lastName || "").trim().slice(0, 80),
    limit_cents: cents,
    transaction_limit_cents: cents,
    max_transaction_count: null,
    currency: "EUR",
    status: input.locked ? "locked" : "active",
    last4,
    valid_from: window.validFrom,
    valid_to: window.validTo,
  };
}

export function pliantIdFromStayState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const id = (state as { pliantCardId?: unknown }).pliantCardId;
  if (typeof id !== "string") return null;
  const clean = id.trim();
  return clean && clean.length <= 80 ? clean : null;
}
