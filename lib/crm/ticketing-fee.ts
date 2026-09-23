export const TICKETING_FEE_EUR = 25;
export const TICKETING_FEE_LABEL = "Frais de billeterie";

/** 1 passager = 1 billet = 25 €, même avec plusieurs segments. */
export function ticketingTicketCount(input: {
  hasFlight: boolean;
  travelerCount: number;
}) {
  if (!input.hasFlight) return 0;
  return Math.max(1, input.travelerCount);
}

export function ticketingFeeAmount(input: {
  hasFlight: boolean;
  travelerCount: number;
}) {
  return ticketingTicketCount(input) * TICKETING_FEE_EUR;
}

export function ticketingFeeExternalId(bookingId: string) {
  return `booking:${bookingId}:ticketing-fee`;
}

export function ticketingFeeLabel(ticketCount: number) {
  const n = Math.max(0, ticketCount);
  return `${TICKETING_FEE_LABEL} (${n} billet${n > 1 ? "s" : ""})`;
}
