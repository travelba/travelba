import { fitPliantText, pliantCardName, pliantCardNomination } from "./eta-il-fee";
import { fullCreditTransactionCount } from "./full-credit";

/** Carte virtuelle distincte de la carte formalité. Le numéro reste chez Pliant. */
export function fullCreditCardSpec(input: {
  firstName: string;
  lastName: string;
  hotelName: string;
  nights: number;
  ceilingCents: number;
  endAt: string | null;
  today: string;
  organizationId: string;
}) {
  const named = pliantCardNomination({ firstName: input.firstName, lastName: input.lastName });
  const hotel = pliantCardName(input.hotelName) || "Hotel";
  const label = fitPliantText(named.label, ` ${hotel}`, 40);
  const end = (input.endAt || "").slice(0, 10);
  const validTo = /^\d{4}-\d{2}-\d{2}$/.test(end) && end >= input.today ? end : input.today;
  const money = { value: input.ceilingCents, currency: "EUR" as const };
  return {
    label,
    body: {
      organizationId: input.organizationId,
      cardConfig: "PLIANT_VIRTUAL_TRAVEL",
      label,
      customFirstName: named.customFirstName,
      customLastName: named.customLastName,
      limit: money,
      transactionLimit: money,
      limitRenewFrequency: "TOTAL" as const,
      maxTransactionCount: fullCreditTransactionCount(input.nights),
      validFrom: input.today,
      validTo,
      validTimezone: "Europe/Paris",
    },
  };
}
