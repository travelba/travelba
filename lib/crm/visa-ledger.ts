import { VISA_EUR } from "./extras";
import { centsToEur, VISA_OFFICIAL, type VisaCorridor } from "./visa-fees";

export function stateTaxExternalId(pliantTransactionId: string) {
  return `pliant:${pliantTransactionId}`;
}

export function agencyFeeExternalId(bookingId: string, travelerId: string, country: VisaCorridor) {
  return `visa-fee:${bookingId}:${travelerId}:${country}`;
}

export type VisaLedgerLine = {
  label: string;
  amount: number;
  currency: "EUR";
  externalId: string;
  voided: boolean;
};

/** La taxe d’État n’est écrite qu’au montant EUR confirmé par Pliant. Les 25 € suivent, voyageur par voyageur. */
export function ledgerAfterCharge(input: {
  bookingId: string;
  country: VisaCorridor;
  pliantTransactionId: string;
  paidCents: number;
  travelerIds: string[];
  refusedTravelerIds: string[];
}): VisaLedgerLine[] {
  if (!(input.paidCents > 0) || !input.pliantTransactionId) return [];
  const refused = new Set(input.refusedTravelerIds);
  const lines: VisaLedgerLine[] = [
    {
      label: VISA_OFFICIAL[input.country].taxLabel,
      amount: centsToEur(input.paidCents),
      currency: "EUR",
      externalId: stateTaxExternalId(input.pliantTransactionId),
      voided: false,
    },
  ];
  for (const travelerId of input.travelerIds) {
    lines.push({
      label: "Obtention du visa",
      amount: VISA_EUR,
      currency: "EUR",
      externalId: agencyFeeExternalId(input.bookingId, travelerId, input.country),
      voided: refused.has(travelerId),
    });
  }
  return lines;
}
