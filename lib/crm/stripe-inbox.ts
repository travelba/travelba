/** File Stripe : uniquement les paiements réussis, jamais un virement Revolut ni un PAN. */

import { shownPersonName } from "@/lib/crm/identity";

export const STRIPE_INBOX_METHODS = ["card", "apple_pay", "sepa", "other"] as const;

/** Incrémenté quand la cascade du payeur change : la synchro suivante recalcule les crédits déjà lus. */
export const STRIPE_PAYER_RESOLUTION = 2;

export type StripeInboxMethod = (typeof STRIPE_INBOX_METHODS)[number];

export type StripeChargeHint = {
  name?: string | null;
  email?: string | null;
  description?: string | null;
  receiptEmail?: string | null;
  type?: string | null;
  last4?: string | null;
  wallet?: string | null;
};

export type StripeCustomerHint = {
  id?: string | null;
  name?: string | null;
  businessName?: string | null;
  email?: string | null;
};

export type StripeCheckoutHint = {
  name?: string | null;
  businessName?: string | null;
  individualName?: string | null;
  email?: string | null;
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
  customer?: StripeCustomerHint | null;
  checkout?: StripeCheckoutHint | null;
  /** Nom déjà résolu depuis metadata CRM (client ou dossier). */
  crmPayerName?: string | null;
  /** False tant qu’une session Checkout n’a pas pu être lue : la synchro réessaiera. */
  payerResolved?: boolean;
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

export type StripePayerSources = {
  crmName?: string | null;
  billingName?: string | null;
  customerName?: string | null;
  customerBusinessName?: string | null;
  checkoutName?: string | null;
  checkoutBusinessName?: string | null;
  checkoutIndividualName?: string | null;
  checkoutEmail?: string | null;
  billingEmail?: string | null;
  receiptEmail?: string | null;
  customerEmail?: string | null;
};

/**
 * Payeur affiché, du plus sûr au plus large :
 * nom CRM (metadata) , nom de facturation, nom du customer Stripe,
 * nom puis e-mail de la session Checkout, e-mail de facturation ou reçu, e-mail du customer.
 */
export function stripePayerFromSources(sources: StripePayerSources) {
  const crmName = clean(sources.crmName);
  const billingName = clean(sources.billingName);
  const customerName = clean(sources.customerName) || clean(sources.customerBusinessName);
  const checkoutName =
    clean(sources.checkoutName) || clean(sources.checkoutBusinessName) || clean(sources.checkoutIndividualName);
  const checkoutEmail = clean(sources.checkoutEmail);
  const billingEmail = clean(sources.billingEmail) || clean(sources.receiptEmail);
  const customerEmail = clean(sources.customerEmail);
  const email = billingEmail || checkoutEmail || customerEmail;
  const name =
    crmName || billingName || customerName || checkoutName || checkoutEmail || billingEmail || customerEmail;
  return { name, email };
}

export type StripeCrmCustomer = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
};

export type StripeCrmBooking = {
  reference: string;
  customer_id: string;
  billing_customer_id?: string | null;
};

export function stripeCustomerPayerLabel(
  customer: { first_name?: string | null; last_name?: string | null; company_name?: string | null } | null | undefined
) {
  if (!customer) return null;
  return shownPersonName(customer) || clean(customer.company_name);
}

/** Nom CRM : fiche `crm_customer_id`, sinon le payeur du dossier `reference`. */
export function stripeCrmPayerName(
  metadata: Record<string, string> | null | undefined,
  customers: StripeCrmCustomer[],
  bookings: StripeCrmBooking[]
) {
  const meta = metadata || {};
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  const id = (meta.crm_customer_id || "").trim();
  if (id && byId.has(id)) return stripeCustomerPayerLabel(byId.get(id));
  const ref = (meta.reference || "").trim().toLowerCase();
  if (!ref) return null;
  const booking = bookings.find((item) => item.reference.trim().toLowerCase() === ref);
  if (!booking) return null;
  const payerId = (booking.billing_customer_id || booking.customer_id || "").trim();
  return stripeCustomerPayerLabel(byId.get(payerId));
}

/** Session Checkout seulement si aucun nom CRM, de facturation ou de customer n’est déjà là. */
export function stripeNeedsCheckoutPayer(input: {
  crmPayerName?: string | null;
  charge?: StripeChargeHint | null;
  customer?: StripeCustomerHint | null;
}) {
  return !(
    clean(input.crmPayerName) ||
    clean(input.charge?.name) ||
    clean(input.customer?.name) ||
    clean(input.customer?.businessName)
  );
}

export function stripeRawNeedsPayerRefresh(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  return (raw as { payer_resolution?: unknown }).payer_resolution !== STRIPE_PAYER_RESOLUTION;
}

export function stripeIntentIdsToRefresh(
  rows: { stripe_payment_intent_id?: string | null; raw?: unknown }[],
  already: ReadonlySet<string>,
  limit: number
) {
  const ids: string[] = [];
  for (const row of rows) {
    const id = (row.stripe_payment_intent_id || "").trim();
    if (!id || already.has(id) || !stripeRawNeedsPayerRefresh(row.raw)) continue;
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

type StripeCustomerLike = {
  id?: string;
  deleted?: boolean;
  name?: string | null;
  business_name?: string | null;
  email?: string | null;
};

function customerHint(customer: unknown): StripeCustomerHint {
  if (!customer) return {};
  if (typeof customer === "string") return { id: customer };
  if (typeof customer !== "object") return {};
  const record = customer as StripeCustomerLike;
  if (record.deleted) return { id: record.id || null };
  return {
    id: record.id || null,
    name: record.name ?? null,
    businessName: record.business_name ?? null,
    email: record.email ?? null,
  };
}

function preferCustomer(primary: StripeCustomerHint, fallback: StripeCustomerHint): StripeCustomerHint {
  return {
    id: primary.id || fallback.id || null,
    name: clean(primary.name) || clean(fallback.name),
    businessName: clean(primary.businessName) || clean(fallback.businessName),
    email: clean(primary.email) || clean(fallback.email),
  };
}

/** Lecture d’un PaymentIntent (customer et charge déjà déroulés, ou encore des identifiants). */
export function stripeIntentInputFromSnapshot(intent: {
  id?: string | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  description?: string | null;
  receipt_email?: string | null;
  created?: number | null;
  metadata?: Record<string, string> | null;
  customer?: unknown;
  latest_charge?: unknown;
}): StripeIntentInput {
  const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge as {
    description?: string | null;
    receipt_email?: string | null;
    billing_details?: { name?: string | null; email?: string | null } | null;
    payment_method_details?: {
      type?: string | null;
      card?: { last4?: string | null; wallet?: { type?: string | null } | null } | null;
    } | null;
    customer?: unknown;
  } : null;
  const details = charge?.payment_method_details;
  const card = details?.type === "card" ? details.card : null;
  const customer = preferCustomer(customerHint(intent.customer), customerHint(charge?.customer));
  return {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    description: clean(intent.description) || clean(charge?.description),
    receiptEmail: clean(intent.receipt_email) || clean(charge?.receipt_email),
    created: intent.created,
    customerId: customer.id || null,
    metadata: intent.metadata,
    customer,
    charge: charge
      ? {
          name: charge.billing_details?.name ?? null,
          email: charge.billing_details?.email ?? null,
          description: charge.description ?? null,
          receiptEmail: charge.receipt_email ?? null,
          type: details?.type ?? null,
          last4: card?.last4 ?? null,
          wallet: card?.wallet?.type ?? null,
        }
      : null,
  };
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
  const payer = stripePayerFromSources({
    crmName: input.crmPayerName,
    billingName: input.charge?.name,
    customerName: input.customer?.name,
    customerBusinessName: input.customer?.businessName,
    checkoutName: input.checkout?.name,
    checkoutBusinessName: input.checkout?.businessName,
    checkoutIndividualName: input.checkout?.individualName,
    checkoutEmail: input.checkout?.email,
    billingEmail: input.charge?.email,
    receiptEmail: clean(input.receiptEmail) || clean(input.charge?.receiptEmail),
    customerEmail: input.customer?.email,
  });
  const payerName = payer.name;
  const payerEmail = payer.email;
  const reference = clean(input.description) || clean(input.charge?.description);
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
      ...(input.payerResolved === false ? {} : { payer_resolution: STRIPE_PAYER_RESOLUTION }),
    },
  };
}

/** Champs réécrits à la synchro. Jamais le statut ni le rapprochement déjà posé. */
export function stripeInboxRefreshPatch(draft: StripeInboxDraft) {
  return {
    amount: draft.amount,
    currency: draft.currency,
    direction: draft.direction,
    payer_name: draft.payer_name,
    payer_email: draft.payer_email,
    reference: draft.reference,
    method: draft.method,
    last4: draft.last4,
    booked_at: draft.booked_at,
    raw: draft.raw,
  };
}

/** Présélection certaine : un seul candidat ≥ 90. La synchro ne crédite que celui-là. */
export function stripeSuggestedCustomerId(candidates: { customer_id: string; score: number }[]) {
  const strong = candidates.filter((candidate) => candidate.score >= 90);
  return strong.length === 1 ? strong[0].customer_id : "";
}

const PROPOSAL_REASONS = new Set(["company_name", "dossier", "facture"]);

/**
 * Client proposé à l’écran, sans crédit tant que l’agence n’a pas validé.
 * Un seul candidat certain, ou une seule société / un seul dossier, est présélectionné.
 * Un nom de personne reste à choisir.
 */
export function stripeProposedCustomerId(
  candidates: { customer_id: string; score: number; reason?: string }[]
) {
  const certain = stripeSuggestedCustomerId(candidates);
  if (certain) return certain;
  const top = candidates[0];
  if (!top || top.score < 70 || !top.reason || !PROPOSAL_REASONS.has(top.reason)) return "";
  const peers = candidates.filter((candidate) => candidate.score === top.score);
  return peers.length === 1 ? top.customer_id : "";
}

export function stripeInboxCopy(row: { payer_name?: string | null; reference?: string | null }) {
  const sender = (row.payer_name || "").trim() || "Payeur inconnu";
  const designation = (row.reference || "").trim();
  const unknown = sender === "Payeur inconnu";
  const same = designation.toLowerCase() === sender.toLowerCase();
  return { sender, designation: designation && (unknown || !same) ? designation : "" };
}
