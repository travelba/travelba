export type PliantSpendLine = {
  id: string;
  cardId?: string | null;
  merchant: string | null;
  status: string | null;
  type: string | null;
  billingCents: number | null;
  currency: string | null;
  bookedAt: string | null;
};

export type PliantCardStatus = "active" | "locked";

export type PliantCardDraft = {
  pliant_card_id: string;
  customer_id: string | null;
  booking_id: string | null;
  label: string | null;
  last4: string | null;
  limit_cents: number | null;
  currency: string;
  status: PliantCardStatus;
  limit_manual: boolean;
  transaction_limit_cents: number | null;
  max_transaction_count: number | null;
};

export type PliantCardPatch = Partial<Omit<PliantCardDraft, "pliant_card_id">> & {
  pliant_card_id: string;
};

/** Garde un plafond saisi par l’agent. Une synchro hôtel ou visa ne le réécrit pas. */
export function mergePliantCard(existing: PliantCardDraft | null, incoming: PliantCardPatch): PliantCardDraft {
  const keepLimit = existing?.limit_manual === true && incoming.limit_manual !== true;
  return {
    pliant_card_id: incoming.pliant_card_id,
    customer_id: incoming.customer_id ?? existing?.customer_id ?? null,
    booking_id: incoming.booking_id ?? existing?.booking_id ?? null,
    label: incoming.label ?? existing?.label ?? null,
    last4: four(incoming.last4) ?? existing?.last4 ?? null,
    limit_cents: keepLimit ? (existing?.limit_cents ?? null) : (incoming.limit_cents ?? existing?.limit_cents ?? null),
    currency: currencyOf(incoming.currency || existing?.currency),
    status: incoming.status || existing?.status || "active",
    limit_manual: incoming.limit_manual === true ? true : existing?.limit_manual === true,
    transaction_limit_cents: incoming.transaction_limit_cents ?? existing?.transaction_limit_cents ?? null,
    max_transaction_count: incoming.max_transaction_count ?? existing?.max_transaction_count ?? null,
  };
}

function four(value: string | null | undefined) {
  return value && /^\d{4}$/.test(value) ? value : null;
}

function currencyOf(value: string | null | undefined) {
  const code = (value || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}
