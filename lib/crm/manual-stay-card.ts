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

/** Pliant plafonne une carte voyage à 3 transactions si ce champ est absent. */
export const MANUAL_CARD_TX_MAX = 999_999_999;

/** Entier Postgres : le plafond stocké et celui envoyé à Pliant restent identiques. */
const POSTGRES_INT_MAX = 2_147_483_647;

/** Transfert d’argent. Les retraits DAB (6010, 6011) restent ouverts. */
const MONEY_TRANSFER_MCCS = ["4829", "6012", "6051", "6536", "6537", "6538", "6540"] as const;

export function manualCardControls() {
  return {
    categories: {
      type: "MCC" as const,
      restriction: "BLOCKED" as const,
      values: [...MONEY_TRANSFER_MCCS],
    },
  };
}

function positiveCents(money: unknown) {
  if (!money || typeof money !== "object") return null;
  const raw = Number((money as { value?: unknown }).value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(Math.floor(raw), POSTGRES_INT_MAX);
}

/**
 * Plafond du compte, en centimes, borné à un entier Postgres.
 * Un compte préfinancé annonce un creditLimit à 0 : le plafond utilisable est alors availableLimit.
 */
export function organizationCeilingCents(org: unknown) {
  if (!org || typeof org !== "object") return null;
  const row = org as { creditLimit?: unknown; availableLimit?: unknown };
  return positiveCents(row.creditLimit) ?? positiveCents(row.availableLimit);
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
    maxTransactionCount: MANUAL_CARD_TX_MAX,
    cardControls: manualCardControls(),
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
