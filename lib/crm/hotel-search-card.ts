import { bookingCardValidity, manualStayCardBody } from "./manual-stay-card";

/** La carte test ne part que si Pliant est explicitement en sandbox. */
export function hotelSearchCardDraft(input: {
  sandbox: boolean;
  configured: boolean;
  firstName: string;
  lastName: string;
  hotelName: string;
  clientName: string;
  reference: string;
  sellCents: number;
  currency: string;
  checkOut: string;
  today: string;
  organizationId: string;
}) {
  if (!input.sandbox) {
    return { ok: false as const, message: "L’émission reste coupée tant que Pliant n’est pas en mode test." };
  }
  if (!input.configured || !input.organizationId.trim()) {
    return { ok: false as const, message: "Pliant n’est pas branché." };
  }
  if (input.currency !== "EUR") {
    return { ok: false as const, message: "La carte test se limite au montant en euros." };
  }
  if (!Number.isInteger(input.sellCents) || input.sellCents < 1) {
    return { ok: false as const, message: "Montant invalide." };
  }
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) {
    return { ok: false as const, message: "Le prénom et le nom manquent sur la fiche." };
  }
  const validity = bookingCardValidity(input.today, input.checkOut);
  const body = manualStayCardBody({
    firstName,
    lastName,
    limitCents: input.sellCents,
    validFrom: validity.validFrom,
    validTo: validity.validTo,
    organizationId: input.organizationId.trim(),
    client: input.clientName.trim() || `${firstName} ${lastName}`,
    place: input.hotelName,
    hotels: [input.hotelName],
    reference: input.reference,
    transactionLimitCents: input.sellCents,
    currency: "EUR",
  });
  return { ok: true as const, body };
}
