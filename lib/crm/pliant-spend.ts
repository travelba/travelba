import { fitPliantText, pliantCardName, pliantCardNomination } from "./eta-il-fee";
import { addIsoDays } from "./hotel-arrival";
import { formatMoney } from "./money";

export const BOOKING_PLIANT_MAX_TX = 30;
export const BOOKING_PLIANT_MIN_CENTS = 100;
export const BOOKING_PLIANT_MAX_CENTS = 10_000_000;

const SPEND_TYPES = new Set(["PURCHASE", "CASH_WITHDRAWAL", "REFUND", "CHARGEBACK"]);

const TYPE_LABEL: Record<string, string> = {
  PURCHASE: "Achat",
  REFUND: "Remboursement",
  CASH_WITHDRAWAL: "Retrait",
  CHARGEBACK: "Contestation",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En cours",
  CONFIRMED: "Confirmée",
  BOOKED: "Comptabilisée",
  DECLINED: "Refusée",
  REVERSED: "Annulée",
};

export function bookingCardCeilingCents(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  if (cents < BOOKING_PLIANT_MIN_CENTS || cents > BOOKING_PLIANT_MAX_CENTS) return null;
  return cents;
}

/** Valable jusqu’à 14 jours après la fin du séjour, ou 90 jours si le séjour est déjà passé. */
export function bookingPliantValidity(today: string, endDate: string | null | undefined) {
  const end = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= today ? endDate : null;
  return {
    validFrom: today,
    validTo: addIsoDays(end || today, end ? 14 : 90),
  };
}

export function bookingPliantLabel(firstName: string, lastName: string, reference: string) {
  const name = `${firstName} ${lastName}`.trim();
  const ref = reference.trim();
  if (!ref) return name.slice(0, 40);
  return fitPliantText(name, ` ${ref}`, 40);
}

export function bookingPliantCardSpec(input: {
  firstName: string;
  lastName: string;
  bookingReference: string;
  ceilingCents: number;
  today: string;
  endDate?: string | null;
  organizationId: string;
}) {
  const first = pliantCardName(input.firstName);
  const last = pliantCardName(input.lastName);
  if (!first || !last) return null;
  const name = pliantCardNomination({ firstName: input.firstName, lastName: input.lastName });
  const validity = bookingPliantValidity(input.today, input.endDate);
  const money = { value: input.ceilingCents, currency: "EUR" as const };
  const label = bookingPliantLabel(name.customFirstName, name.customLastName, input.bookingReference);
  return {
    holderFirstName: name.customFirstName,
    holderLastName: name.customLastName,
    label,
    ...validity,
    body: {
      organizationId: input.organizationId,
      cardConfig: "PLIANT_VIRTUAL_TRAVEL",
      label,
      customFirstName: name.customFirstName,
      customLastName: name.customLastName,
      limit: money,
      transactionLimit: money,
      limitRenewFrequency: "TOTAL" as const,
      maxTransactionCount: BOOKING_PLIANT_MAX_TX,
      validFrom: validity.validFrom,
      validTo: validity.validTo,
      validTimezone: "Europe/Paris",
    },
  };
}

export type PliantSpendDraft = {
  pliantTransactionId: string;
  pliantCardId: string;
  status: string;
  type: string;
  amountCents: number;
  currency: string;
  merchant: string;
  bookedAt: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function moneyValue(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as { value?: unknown; currency?: unknown };
  const amount = typeof row.value === "number" ? row.value : Number(row.value);
  const currency = text(row.currency) || "EUR";
  if (!Number.isFinite(amount)) return null;
  return { cents: Math.round(amount), currency };
}

export function pliantMerchantName(row: Record<string, unknown>) {
  const data = row.merchantData;
  if (data && typeof data === "object") {
    const display = text((data as { displayName?: unknown }).displayName);
    if (display) return display.slice(0, 120);
  }
  const raw = row.merchantRawData;
  if (raw && typeof raw === "object") {
    const source = raw as Record<string, unknown>;
    const name =
      text(source.merchantLegalName) ||
      text(source.descriptionConfirmation) ||
      text(source.descriptionAuthorization);
    if (name) return name.slice(0, 120);
  }
  return "";
}

function signedCents(type: string, cents: number) {
  if ((type === "REFUND" || type === "CHARGEBACK") && cents > 0) return -cents;
  return cents;
}

export function pliantSpendFromApi(value: unknown): PliantSpendDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const type = text(row.type);
  if (!SPEND_TYPES.has(type)) return null;
  const pliantTransactionId = text(row.transactionId);
  const pliantCardId = text(row.cardId);
  if (!pliantTransactionId || !pliantCardId) return null;
  const money = moneyValue(row.billingAmount) || moneyValue(row.transactionAmount);
  if (!money) return null;
  const booked = text(row.confirmedAt) || text(row.createdAt) || text(row.bookedAt);
  return {
    pliantTransactionId,
    pliantCardId,
    status: text(row.status) || "PENDING",
    type,
    amountCents: signedCents(type, money.cents),
    currency: money.currency,
    merchant: pliantMerchantName(row),
    bookedAt: booked || null,
  };
}

export function mergePliantMerchant(draft: PliantSpendDraft, detail: unknown): PliantSpendDraft {
  if (!detail || typeof detail !== "object") return draft;
  const merchant = pliantMerchantName(detail as Record<string, unknown>);
  return merchant ? { ...draft, merchant } : draft;
}

export function pliantSpendTypeLabel(type: string) {
  return TYPE_LABEL[type] || "Dépense";
}

export function pliantSpendStatusLabel(status: string) {
  return STATUS_LABEL[status] || status;
}

export function pliantSpendTitle(row: { merchant: string; type: string }) {
  return row.merchant.trim() || pliantSpendTypeLabel(row.type);
}

/** Achat en moins, remboursement en plus. */
export function formatPliantAmount(cents: number, currency = "EUR") {
  const text = formatMoney(Math.abs(cents) / 100, currency);
  return cents < 0 ? `+${text}` : `−${text}`;
}

export type PliantCardLink = { bookingId: string; customerId: string | null };

export function linkPliantSpend(draft: PliantSpendDraft, cards: Map<string, PliantCardLink>) {
  const link = cards.get(draft.pliantCardId);
  return {
    pliant_transaction_id: draft.pliantTransactionId,
    pliant_card_id: draft.pliantCardId,
    booking_id: link?.bookingId || null,
    customer_id: link?.customerId || null,
    merchant: draft.merchant,
    type: draft.type,
    status: draft.status,
    amount_cents: draft.amountCents,
    currency: draft.currency,
    booked_at: draft.bookedAt,
  };
}
