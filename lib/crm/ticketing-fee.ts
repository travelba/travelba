export const TICKETING_FEE_EUR = 25;
export const TICKETING_FEE_LABEL = "Frais de billeterie";

/** 25 € pour le voyage, pas pour chaque billet ni pour chaque segment. */
export function ticketingTicketCount(input: { hasFlight: boolean; travelerCount?: number }) {
  return input.hasFlight ? 1 : 0;
}

export function ticketingFeeAmount(input: { hasFlight: boolean; travelerCount?: number }) {
  return ticketingTicketCount(input) * TICKETING_FEE_EUR;
}

export function ticketingFeeExternalId(bookingId: string) {
  return `booking:${bookingId}:ticketing-fee`;
}

export function ticketingFeeLabel(_ticketCount?: number) {
  return TICKETING_FEE_LABEL;
}
