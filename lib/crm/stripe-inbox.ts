/** File Stripe : uniquement les paiements réussis, jamais un virement Revolut ni un PAN. */

export const STRIPE_INBOX_METHODS = ["card", "apple_pay", "sepa", "other"] as const;

export type StripeInboxMethod = (typeof STRIPE_INBOX_METHODS)[number];

export type StripeChargeHint = {
  name?: string | null;
  email?: string | null;
  type?: string | null;
  last4?: string | null;
  wallet?: string | null;
};

export type StripeIntentInput = {
  id?: string | null;
  status?: string | null;
  /** Centimes Stripe. */
  amount?: number | null;
  currency?: string | null;
  description?: string | null;
  receiptEmail?: string | null;
  /** Secondes Unix. */
  created?: number | null;
  customerId?: string | null;
  metadata?: Record<string, string> | null;
  charge?: StripeChargeHint | null;
};

export type StripeInboxDraft = {
  stripe_payment_intent_id: string;
  amount: number;
  currency: string;
  direction: "credit";
  payer_name: string | null;
  payer_email: string | null;
  reference: string | null;
  method: StripeInboxMethod;
  last4: string | null;
  booked_at: string | null;
  raw: Record<string, unknown>;
};

export function shouldIngestStripeForRapprochement(input: {
  status?: string | null;
  amountCents?: number | null;
  payMethod?: string | null;
}) {
  if (input.status !== "succeeded") return false;
  if ((input.payMethod || "").trim() === "revolut") return false;
  const amount = Number(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return true;
}

export function stripeInboxMethod(input: {
  payMethod?: string | null;
  chargeType?: string | null;
  wallet?: string | null;
}): StripeInboxMethod {
  const pay = (input.payMethod || "").trim();
  if (pay === "apple_pay" || input.wallet === "apple_pay") return "apple_pay";
  if (pay === "sepa_debit" || input.chargeType === "sepa_debit") return "sepa";
  if (pay === "card" || input.chargeType === "card") return "card";
  return "other";
}

export function stripeMethodLabel(method: StripeInboxMethod | null | undefined) {
  switch (method) {
    case "card":
      return "Carte";
    case "apple_pay":
      return "Apple Pay";
    case "sepa":
      return "Prélèvement";
    default:
      return "Stripe";
  }
}

/** Carte et Apple Pay = règlement carte. Le prélèvement suit le virement au grand livre. */
export function stripeInboxCreditKind(method: StripeInboxMethod | null | undefined): "card_payment" | "transfer" {
  return method === "sepa" ? "transfer" : "card_payment";
}

export function stripeInboxCreditLabel(input: {
  payerName?: string | null;
  method?: StripeInboxMethod | null;
}) {
  const payer = (input.payerName || "").trim() || "Payeur";
  return `Règlement Stripe · ${payer} · ${stripeMethodLabel(input.method)}`;
}

function clean(value: string | null | undefined) {
  const text = (value || "").trim();
  return text || null;
}

/** Metadata copiées sans suite de chiffres qui ressemble à un PAN. */
export function stripeSafeMetadata(metadata: Record<string, string> | null | undefined) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (typeof value !== "string") continue;
    if (/\d{13,19}/.test(value.replace(/\s+/g, ""))) continue;
    out[key.slice(0, 40)] = value.slice(0, 500);
  }
  return out;
}

function last4Of(value: string | null | undefined) {
  const text = (value || "").trim();
  return /^\d{4}$/.test(text) ? text : null;
}

export function stripeInboxFromIntent(input: StripeIntentInput): StripeInboxDraft | null {
  const metadata = stripeSafeMetadata(input.metadata);
  const payMethod = metadata.pay_method || null;
  if (
    !shouldIngestStripeForRapprochement({
      status: input.status,
      amountCents: input.amount,
      payMethod,
    })
  ) {
    return null;
  }
  const id = (input.id || "").trim();
  if (!id) return null;
  const method = stripeInboxMethod({
    payMethod,
    chargeType: input.charge?.type,
    wallet: input.charge?.wallet,
  });
  const last4 = last4Of(input.charge?.last4);
  const payerName = clean(input.charge?.name);
  const payerEmail = clean(input.charge?.email) || clean(input.receiptEmail);
  const reference = clean(input.description);
  const cents = Math.round(Number(input.amount));
  const created = Number(input.created);
  return {
    stripe_payment_intent_id: id,
    amount: cents / 100,
    currency: (input.currency || "eur").toUpperCase(),
    direction: "credit",
    payer_name: payerName,
    payer_email: payerEmail,
    reference,
    method,
    last4,
    booked_at: Number.isFinite(created) && created > 0 ? new Date(created * 1000).toISOString() : null,
    raw: {
      id,
      amount: cents,
      currency: (input.currency || "eur").toUpperCase(),
      status: "succeeded",
      description: reference,
      email: payerEmail,
      stripe_customer_id: clean(input.customerId),
      metadata,
      method,
      last4,
    },
  };
}

/** Présélection : un seul candidat certain (≥ 90). */
export function stripeSuggestedCustomerId(candidates: { customer_id: string; score: number }[]) {
  const strong = candidates.filter((candidate) => candidate.score >= 90);
  return strong.length === 1 ? strong[0].customer_id : "";
}

export function stripeInboxCopy(row: { payer_name?: string | null; reference?: string | null }) {
  const sender = (row.payer_name || "").trim() || "Payeur inconnu";
  const designation = (row.reference || "").trim();
  const same = designation.toLowerCase() === sender.toLowerCase();
  return { sender, designation: designation && !same ? designation : "" };
}
