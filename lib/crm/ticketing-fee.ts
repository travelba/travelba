export const TICKETING_FEE_EUR = 25;
export const TICKETING_FEE_LABEL = "Frais de billeterie";

/** 25 € pour le voyage, pas pour chaque billet ni pour chaque segment. */
export function ticketingTicketCount(input: { hasFlight: boolean; travelerCount?: number }) {
  return input.hasFlight ? 1 : 0;
}

export function ticketingFeeAmount(input: { hasFlight: boolean; travelerCount?: number }) {
  return ticketingTicketCount(input) * TICKETING_FEE_EUR;
}

/** Même règle que le débit du grand livre : 25 € une fois, dossier confirmé avec un vol. */
export function collectableTicketingFee(input: { status: string; hasFlight: boolean }) {
  if (input.status !== "confirmed" && input.status !== "travelling" && input.status !== "completed") return 0;
  return ticketingFeeAmount({ hasFlight: input.hasFlight });
}

export function ticketingFeeExternalId(bookingId: string) {
  return `booking:${bookingId}:ticketing-fee`;
}

export function ticketingFeeLabel(_ticketCount?: number) {
  return TICKETING_FEE_LABEL;
}
