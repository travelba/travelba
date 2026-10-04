import { pliantCardNomination } from "./eta-il-fee";
import { addIsoDays, cardCloseDate, isoDate, parseEurosToCents } from "./hotel-arrival";

/** Marque une carte dont le montant a été choisi sur le dossier. Le cron ne la réécrit pas. */
export const MANUAL_CARD_NOTE = "Saisie agence";

export function stayCardIsManual(note: string | null | undefined) {
  return note === MANUAL_CARD_NOTE;
}

export function stayCardCanBeShared(row: {
  pliant_card_id: string | null;
  card_closed_at: string | null;
  status: string;
  task_note?: string | null;
}) {
  return Boolean(row.pliant_card_id) && !row.card_closed_at && row.status !== "closed" && !stayCardIsManual(row.task_note);
}

export function sameCardNameCount(
  existing: { firstName: string; lastName: string }[],
  firstName: string,
  lastName: string
) {
  const first = firstName.trim().toLocaleLowerCase("fr");
  const last = lastName.trim().toLocaleLowerCase("fr");
  if (!first || !last) return 0;
  return existing.filter(
    (row) => row.firstName.trim().toLocaleLowerCase("fr") === first && row.lastName.trim().toLocaleLowerCase("fr") === last
  ).length;
}

/** Aujourd’hui jusqu’à trois jours après la fin du dossier. Sans date, quatre-vingt-dix jours. */
export function bookingCardValidity(today: string, endDate: string | null | undefined) {
  const end = isoDate(endDate);
  const close = end ? cardCloseDate(end) : addIsoDays(today, 90);
  return { validFrom: today, validTo: close < today ? today : close };
}

export function manualStayCardBody(input: {
  firstName: string;
  lastName: string;
  limitCents: number;
  validFrom: string;
  validTo: string;
  organizationId: string;
  existingCards?: number;
}) {
  const name = pliantCardNomination({
    firstName: input.firstName,
    lastName: input.lastName,
    existingCards: input.existingCards,
  });
  const money = { value: input.limitCents, currency: "EUR" as const };
  return {
    organizationId: input.organizationId,
    cardConfig: "PLIANT_VIRTUAL_TRAVEL" as const,
    label: name.label,
    customFirstName: name.customFirstName,
    customLastName: name.customLastName,
    limit: money,
    transactionLimit: money,
    limitRenewFrequency: "TOTAL" as const,
    validFrom: input.validFrom,
    validTo: input.validTo,
    validTimezone: "Europe/Paris" as const,
  };
}

export function manualStayCardDraft(input: {
  amount: string;
  firstName: string;
  lastName: string;
  validFrom: string;
  validTo: string;
  organizationId: string;
  existingCards?: number;
}): { error: string } | { body: ReturnType<typeof manualStayCardBody> } {
  const limitCents = parseEurosToCents(input.amount);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (limitCents == null) return { error: "Indiquez un montant en euros." as const };
  if (!firstName || !lastName) return { error: "Indiquez le nom et le prénom." as const };
  return {
    body: manualStayCardBody({
      firstName,
      lastName,
      limitCents,
      validFrom: input.validFrom,
      validTo: input.validTo,
      organizationId: input.organizationId,
      existingCards: input.existingCards,
    }),
  };
}
