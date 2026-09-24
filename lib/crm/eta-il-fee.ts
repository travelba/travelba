import { ETA_IL_PORTAL } from "./eta-il-draft";
import {
  centsToEur,
  corridorCeilingCents,
  ECB_SNAPSHOT,
  VISA_OFFICIAL,
  type EurFx,
} from "./visa-fees";

/** Frais publiés sur israel-entry.piba.gov.il : 25 ILS par demande. */
export const ETA_IL_FEE_ILS = VISA_OFFICIAL.IL.amount;

const NAME_CHARS = /[^A-Za-z0-9äöüÄÖÜ.\-]+/g;

export function pliantCardName(value: string) {
  return value.replace(NAME_CHARS, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

export function etaIlPliantCard(input: {
  firstName: string;
  lastName: string;
  travelerCount: number;
  bookingReference: string;
  rates?: EurFx;
  organizationId: string;
  cardConfig?: string;
  today?: string;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const count = Math.max(1, Math.floor(Number(input.travelerCount)) || 1);
  const rates = input.rates || ECB_SNAPSHOT.rates;
  const cents = corridorCeilingCents("IL", count, rates) || 0;
  const money = { value: cents, currency: "EUR" };
  const first = pliantCardName(input.firstName) || "Client";
  const last = pliantCardName(input.lastName) || "Travelba";
  const today = input.today || new Date().toISOString().slice(0, 10);
  const validFrom = input.startDate && input.startDate > today ? input.startDate : today;
  const validTo = input.endDate && input.endDate >= validFrom ? input.endDate : validFrom;
  const label = `ETA-IL ${first} ${last}`.slice(0, 40);
  return {
    holderFirstName: first,
    holderLastName: last,
    feeIls: count * ETA_IL_FEE_ILS,
    ceilingEur: centsToEur(cents),
    portal: ETA_IL_PORTAL,
    body: {
      organizationId: input.organizationId,
      cardConfig: input.cardConfig || "PLIANT_VIRTUAL_TRAVEL",
      label,
      customFirstName: first,
      customLastName: last,
      limit: money,
      transactionLimit: money,
      limitRenewFrequency: "TOTAL" as const,
      maxTransactionCount: count,
      validFrom,
      validTo,
      validTimezone: "Europe/Paris",
      customFields: [
        { label: "bookingRef", defaultValue: input.bookingReference },
        { label: "purpose", defaultValue: "ETA-IL" },
      ],
    },
  };
}
