export const TICKETING_FEE_EUR = 25;
export const TICKETING_FEE_LABEL = "Frais de billeterie";

/** 1 passager = 1 billet = 25 €, même avec plusieurs segments. */
export function ticketingTicketCount(input: { hasFlight: boolean; travelerCount?: number }) {
  if (!input.hasFlight) return 0;
  const count = Number(input.travelerCount);
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.min(99, Math.round(count));
}

/** 25 € par billet. */
export function ticketingFeeAmount(input: { hasFlight: boolean; travelerCount?: number }) {
  return ticketingTicketCount(input) * TICKETING_FEE_EUR;
}

/** Même règle que le débit : 25 € par passager, dossier confirmé avec un vol. */
export function collectableTicketingFee(input: { status: string; hasFlight: boolean; travelerCount?: number }) {
  if (input.status !== "confirmed" && input.status !== "travelling" && input.status !== "completed") return 0;
  return ticketingFeeAmount(input);
}

export function ticketingFeeExternalId(bookingId: string) {
  return `booking:${bookingId}:ticketing-fee`;
}

export function ticketingFeeLabel(ticketCount?: number) {
  const count = Number(ticketCount);
  if (!Number.isFinite(count) || count < 1) return TICKETING_FEE_LABEL;
  const n = Math.round(count);
  return `${TICKETING_FEE_LABEL} (${n} billet${n > 1 ? "s" : ""})`;
}
