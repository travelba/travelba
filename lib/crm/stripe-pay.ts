import type { PayerKind } from "@/lib/crm/payer";

/** Moyens proposés dans l’espace client. Apple Pay passe par la carte Stripe. */
export const STAY_PAY_METHODS = ["card", "apple_pay", "sepa_debit", "customer_balance"] as const;

export type StayPayMethod = (typeof STAY_PAY_METHODS)[number];

export const STAY_PAY_LABELS: Record<StayPayMethod, string> = {
  card: "Carte bancaire",
  apple_pay: "Apple Pay",
  sepa_debit: "Prélèvement SEPA",
  customer_balance: "Virement",
};

const STRIPE_METHOD_TYPES = [
  "acss_debit",
  "affirm",
  "afterpay_clearpay",
  "alipay",
  "alma",
  "amazon_pay",
  "au_becs_debit",
  "bacs_debit",
  "bancontact",
  "billie",
  "blik",
  "boleto",
  "card",
  "cashapp",
  "crypto",
  "customer_balance",
  "eps",
  "fpx",
  "giropay",
  "grabpay",
  "ideal",
  "kakao_pay",
  "klarna",
  "konbini",
  "kr_card",
  "mb_way",
  "mobilepay",
  "multibanco",
  "naver_pay",
  "nz_bank_account",
  "oxxo",
  "p24",
  "pay_by_bank",
  "payco",
  "paynow",
  "paypal",
  "payto",
  "pix",
  "promptpay",
  "revolut_pay",
  "samsung_pay",
  "satispay",
  "sepa_debit",
  "sofort",
  "swish",
  "twint",
  "us_bank_account",
  "wechat_pay",
  "zip",
] as const;

export type StripeMethodType = (typeof STRIPE_METHOD_TYPES)[number];

export function stayPayMethodOf(value: unknown): StayPayMethod | null {
  if (typeof value !== "string") return null;
  return (STAY_PAY_METHODS as readonly string[]).includes(value) ? (value as StayPayMethod) : null;
}

/** Société : prélèvement et virement, en euros. Particulier : carte, Apple Pay, et les deux si euros. */
export function stayPayMethods(payer: PayerKind, currency: string): StayPayMethod[] {
  const eur = currency.toUpperCase() === "EUR";
  if (payer === "company") return eur ? ["sepa_debit", "customer_balance"] : [];
  return eur ? ["card", "apple_pay", "sepa_debit", "customer_balance"] : ["card", "apple_pay"];
}

/** Type Stripe conservé. Apple Pay est un portefeuille de la carte. */
export function stripeTypeForMethod(method: StayPayMethod): StripeMethodType {
  if (method === "apple_pay") return "card";
  return method;
}

export function excludedStripeTypes(method: StayPayMethod): StripeMethodType[] {
  const keep = stripeTypeForMethod(method);
  return STRIPE_METHOD_TYPES.filter((type) => type !== keep);
}

export function stripeCreditKind(method: StayPayMethod): "card_payment" | "transfer" {
  return method === "card" || method === "apple_pay" ? "card_payment" : "transfer";
}

export function stripeCreditLabel(method: StayPayMethod, reference: string) {
  return `Règlement ${reference} · ${STAY_PAY_LABELS[method]}`;
}

type IntentLike = {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, string> | null;
};

/** Crédit du grand livre une fois le PaymentIntent abouti. Rien avant. */
export function stripeCreditFromIntent(intent: IntentLike) {
  if (intent.status !== "succeeded" || !intent.id) return null;
  const metadata = intent.metadata || {};
  const customerId = metadata.crm_customer_id || "";
  const bookingId = metadata.crm_booking_id || "";
  const method = stayPayMethodOf(metadata.pay_method);
  const amount = Number(intent.amount);
  if (!customerId || !bookingId || !method || !Number.isFinite(amount) || amount <= 0) return null;
  const companyId = (metadata.billing_company_id || "").trim();
  return {
    customer_id: customerId,
    booking_id: bookingId,
    billing_company_id: companyId || null,
    direction: "credit" as const,
    kind: stripeCreditKind(method),
    amount: Math.round(amount) / 100,
    currency: (intent.currency || "eur").toUpperCase(),
    label: stripeCreditLabel(method, metadata.reference || bookingId),
    source: "stripe" as const,
    external_id: intent.id,
    status: "posted" as const,
  };
}

type BankAddress = {
  type?: string;
  iban?: {
    iban?: string;
    bic?: string;
    account_holder_name?: string;
  };
};

/** Coordonnées de virement renvoyées par Stripe. L’IBAN n’est pas journalisé. */
export function bankTransferInstructions(intent: {
  status?: string;
  next_action?: {
    display_bank_transfer_instructions?: {
      reference?: string | null;
      amount_remaining?: number | null;
      currency?: string | null;
      financial_addresses?: BankAddress[];
    } | null;
  } | null;
}) {
  const instructions = intent.next_action?.display_bank_transfer_instructions;
  const iban = instructions?.financial_addresses?.find((row) => row.iban?.iban)?.iban;
  if (!instructions || !iban?.iban) return null;
  return {
    iban: iban.iban,
    bic: iban.bic || "",
    accountHolder: iban.account_holder_name || "",
    reference: instructions.reference || "",
    amountRemaining: instructions.amount_remaining ?? null,
    currency: (instructions.currency || "eur").toUpperCase(),
    pending: intent.status !== "succeeded",
  };
}
