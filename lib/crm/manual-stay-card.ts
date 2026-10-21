import { pliantCardNomination, pliantStayCaption } from "./eta-il-fee";
import { addIsoDays, cardCloseDate, isoDate, parseEurosToCents } from "./hotel-arrival";
import { PLIANT_SINGLE_USE } from "./pliant-controls";

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

/** Montant maximum d’un achat. La carte est à usage unique : pas de nombre de transactions. */
export function cardTransactionRules(input: {
  limitCents: number;
  transactionAmount: string;
}): { error: string } | { transactionLimitCents: number } {
  const transactionLimitCents = parseEurosToCents(input.transactionAmount);
  if (transactionLimitCents == null) return { error: "Indiquez le montant par transaction." };
  if (transactionLimitCents > input.limitCents) {
    return { error: "Le montant par transaction ne peut pas dépasser le plafond." };
  }
  return { transactionLimitCents };
}

export function manualStayCardBody(input: {
  firstName: string;
  lastName: string;
  limitCents: number;
  validFrom: string;
  validTo: string;
  organizationId: string;
  existingCards?: number;
  designation?: string | null;
  /** Nom du client, distinct du titulaire imprimé sur la carte. */
  client?: string | null;
  /** Hôtel ou fournisseur. La désignation sert si ce champ est vide. */
  place?: string | null;
  hotels?: Array<string | null | undefined>;
  reference?: string | null;
  transactionLimitCents?: number;
  currency?: string;
}) {
  const name = pliantCardNomination({
    firstName: input.firstName,
    lastName: input.lastName,
    existingCards: input.existingCards,
  });
  const ordinal = Math.max(0, Math.floor(Number(input.existingCards)) || 0) + 1;
  const mark = (value: string | null | undefined) => {
    const text = (value || "").trim();
    if (!text) return "";
    return ordinal > 1 ? `${text} ${ordinal}` : text;
  };
  const hotels = [...(input.hotels || []), input.place].map((hotel) => mark(hotel)).filter(Boolean);
  const designation = mark(input.designation);
  const caption =
    hotels.length || designation || (input.reference || "").trim()
      ? pliantStayCaption({
          client: input.client || input.lastName,
          hotels,
          designation,
          reference: input.reference,
        })
      : null;
  const code = (input.currency || "EUR").trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(code) ? code : "EUR";
  const money = { value: input.limitCents, currency };
  const perTransaction = input.transactionLimitCents ?? input.limitCents;
  return {
    organizationId: input.organizationId,
    cardConfig: PLIANT_SINGLE_USE,
    label: caption?.label || name.label,
    purpose: caption?.purpose || name.label,
    customFirstName: name.customFirstName,
    customLastName: name.customLastName,
    limit: money,
    transactionLimit: { value: perTransaction, currency },
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
  designation?: string | null;
  client?: string | null;
  place?: string | null;
  hotels?: Array<string | null | undefined>;
  reference?: string | null;
  transactionAmount?: string;
  /** Ignoré. La carte est à usage unique : un nombre de transactions n’est pas envoyé. */
  transactionCount?: string;
  currency?: string;
}): { error: string } | { body: ReturnType<typeof manualStayCardBody> } {
  const limitCents = parseEurosToCents(input.amount);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (limitCents == null) return { error: "Indiquez un montant en euros." as const };
  if (!firstName || !lastName) return { error: "Indiquez le nom et le prénom." as const };
  const rules =
    input.transactionAmount != null
      ? cardTransactionRules({
          limitCents,
          transactionAmount: input.transactionAmount,
        })
      : null;
  if (rules && "error" in rules) return { error: rules.error };
  return {
    body: manualStayCardBody({
      firstName,
      lastName,
      limitCents,
      validFrom: input.validFrom,
      validTo: input.validTo,
      organizationId: input.organizationId,
      existingCards: input.existingCards,
      designation: input.designation,
      client: input.client,
      place: input.place,
      hotels: input.hotels,
      reference: input.reference,
      transactionLimitCents: rules?.transactionLimitCents,
      currency: input.currency,
    }),
  };
}
