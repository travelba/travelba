import { pieceDigits, suggestStripePayers, type PayerHistory, type PayerPiece } from "@/lib/crm/stripe-payer";

/**
 * Un versement Stripe sur Revolut devient une ligne par paiement client,
 * plus une ligne de frais d’agence. La somme des lignes vaut le versement.
 * Le client a payé le brut : c’est ce montant qui se crédite. Les frais Stripe
 * restent à l’agence (ligne non créditable), ils ne deviennent pas un débit client.
 */

export type PayoutSnapshot = {
  id: string;
  amountCents: number;
  currency: string;
  /** Secondes Unix, minuit UTC du jour d’arrivée. */
  arrivalDate: number;
  created: number;
  status: string;
};

export type BalanceLineSnapshot = {
  id: string;
  type: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  description: string | null;
  sourceId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  name: string | null;
  email: string | null;
  /** Identifiant client Stripe (cus_…), pas l'identifiant CRM. */
  customerId?: string | null;
  metadata: Record<string, string>;
};

export type StripeLineKind = "paiement" | "remboursement" | "frais" | "cache";

export type StripeLineDetail = {
  kind: StripeLineKind;
  payout_id: string | null;
  payment_id: string | null;
  payment_intent_id: string | null;
  email: string | null;
  name: string | null;
  stripe_customer_id?: string | null;
  suggestion_reason?: string | null;
  dossier_ref: string | null;
  customer_id: string | null;
  booking_id: string | null;
  gross: number;
  fee: number;
  net: number;
  currency: string;
  deja_encaisse: boolean;
  complete?: boolean;
  fetched_at?: string;
  introuvable?: boolean;
};

export type SplitDraft = {
  revolut_transaction_id: string;
  category: "stripe_paiement" | "frais" | "remboursement";
  status: "unmatched" | "ignored" | "matched";
  amount: number;
  currency: string;
  counterparty_name: string | null;
  reference: string | null;
  booked_at: string | null;
  stripe_line: StripeLineDetail;
  matched_customer_id: string | null;
  matched_transaction_id: string | null;
};

export type StripeLinkIndex = {
  customers: Array<{ id: string; email: string | null; stripe_customer_id: string | null }>;
  bookings: Array<{ id: string; reference: string; customer_id: string | null }>;
  posted: Array<{ id: string; customer_id: string; external_id: string }>;
  history?: PayerHistory[];
  pieces?: PayerPiece[];
};

const DAY_SECONDS = 86_400;
const BOOKING_REF = /\bTB-\d{4}-\d{4}\b/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Seule une clé live interroge Stripe : une clé test ne doit pas marquer les versements réels introuvables. */
export function stripeLiveKey(secret: string | null | undefined) {
  const key = (secret || "").trim();
  return key.startsWith("sk_live_") || key.startsWith("rk_live_");
}

export function eurosFromCents(cents: number) {
  return Math.round(cents) / 100;
}

export function moneyCents(amount: number) {
  return Math.round(Number(amount) * 100);
}

/** Le versement dont le montant est celui du mouvement Revolut, arrivé le même jour. */
export function matchStripePayout(
  revolut: { amount: number; currency: string; bookedAt: string | null },
  payouts: PayoutSnapshot[]
) {
  const cents = moneyCents(revolut.amount);
  const currency = (revolut.currency || "EUR").toLowerCase();
  const booked = revolut.bookedAt ? Date.parse(revolut.bookedAt) / 1000 : Number.NaN;
  const open = payouts.filter((payout) => {
    if (payout.amountCents !== cents) return false;
    if ((payout.currency || "").toLowerCase() !== currency) return false;
    const status = (payout.status || "").toLowerCase();
    if (status === "failed" || status === "canceled" || status === "cancelled") return false;
    if (!Number.isFinite(booked)) return true;
    return Math.abs(payout.arrivalDate - booked) <= 3 * DAY_SECONDS;
  });
  open.sort((left, right) => {
    const gap = Math.abs(left.arrivalDate - booked) - Math.abs(right.arrivalDate - booked);
    if (gap !== 0) return gap;
    return Math.abs(left.created - booked) - Math.abs(right.created - booked);
  });
  return open[0] || null;
}

function cleanMeta(metadata: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (typeof value !== "string") continue;
    if (/\d{13,19}/.test(value.replace(/\s+/g, ""))) continue;
    out[key] = value.trim();
  }
  return out;
}

function emailKey(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function bookingRefIn(values: Array<string | null | undefined>) {
  for (const value of values) {
    const match = (value || "").match(BOOKING_REF);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

function linkPayment(line: BalanceLineSnapshot, links: StripeLinkIndex) {
  const metadata = cleanMeta(line.metadata);
  const metaCustomer = (metadata.crm_customer_id || "").trim();
  const metaBooking = (metadata.crm_booking_id || metadata.booking_id || "").trim();
  const ref = bookingRefIn([
    metadata.reference,
    metadata.dossier,
    metadata.dossier_ref,
    metadata.booking_reference,
    line.description,
  ]);
  const booking =
    (UUID.test(metaBooking) ? links.bookings.find((item) => item.id === metaBooking) : null) ||
    (ref ? links.bookings.find((item) => item.reference.toUpperCase() === ref) : null) ||
    null;
  let customerId = UUID.test(metaCustomer) ? metaCustomer : "";
  let suggestionReason: string | null = customerId ? "metadata" : null;
  if (customerId && !links.customers.some((item) => item.id === customerId)) {
    customerId = "";
    suggestionReason = null;
  }
  if (!customerId && line.email) {
    const hits = links.customers.filter((item) => emailKey(item.email) === emailKey(line.email));
    if (hits.length === 1) {
      customerId = hits[0].id;
      suggestionReason = "email";
    }
  }
  const stripeCustomer = (metadata.stripe_customer_id || line.customerId || "").trim();
  if (!customerId && stripeCustomer) {
    const hits = links.customers.filter((item) => (item.stripe_customer_id || "") === stripeCustomer);
    if (hits.length === 1) {
      customerId = hits[0].id;
      suggestionReason = "stripe_customer";
    }
  }
  const suggestions = suggestStripePayers({
    email: customerId ? null : line.email,
    stripeCustomerId: customerId ? null : stripeCustomer,
    designation: pieceDigits(line.description) || pieceDigits(metadata.reference) || line.description,
    customers: links.customers,
    history: links.history,
    pieces: links.pieces,
  });
  const piece = suggestions.find((item) => item.reason === "piece");
  const other = suggestions.find((item) => item.reason !== "piece");
  if (!customerId && other) {
    customerId = other.customerId;
    suggestionReason = other.reason;
  }
  let linkedBooking = booking;
  if (piece && (!customerId || piece.customerId === customerId)) {
    if (!customerId) {
      customerId = piece.customerId;
      suggestionReason = "piece";
    }
    if (!linkedBooking && piece.bookingId) {
      linkedBooking = links.bookings.find((item) => item.id === piece.bookingId) || {
        id: piece.bookingId,
        reference: piece.reference || "",
        customer_id: piece.customerId,
      };
    }
  }
  if (!customerId && linkedBooking?.customer_id) customerId = linkedBooking.customer_id;
  const externalIds = [line.paymentIntentId, line.chargeId, line.sourceId].filter((id): id is string => Boolean(id));
  const posted = links.posted.find((item) => externalIds.includes(item.external_id));
  return {
    customerId: customerId || posted?.customer_id || null,
    bookingId: linkedBooking?.id || null,
    dossierRef: linkedBooking?.reference || ref,
    posted: posted || null,
    suggestionReason,
    stripeCustomerId: stripeCustomer || null,
  };
}

function isPayment(line: BalanceLineSnapshot) {
  return (line.type === "charge" || line.type === "payment") && line.amountCents > 0;
}

function isRefund(line: BalanceLineSnapshot) {
  if (line.type === "payout") return false;
  if (isPayment(line)) return false;
  return line.type === "refund" || line.type === "payment_refund" || line.amountCents < 0;
}

/**
 * Lignes dont la somme en centimes vaut le versement Revolut.
 * Brut des paiements + remboursements + frais (négatif) = net reçu.
 */
export function buildStripeSplit(input: {
  parent: { revolutTransactionId: string; amount: number; currency: string; bookedAt: string | null };
  payoutId: string;
  balance: BalanceLineSnapshot[];
  links: StripeLinkIndex;
}): { ok: true; drafts: SplitDraft[] } | { ok: false; reason: "mismatch" } {
  const currency = (input.parent.currency || "EUR").toUpperCase();
  const parentCents = moneyCents(input.parent.amount);
  const kept = input.balance.filter((line) => line.type !== "payout");
  const payments = kept.filter(isPayment);
  const refunds = kept.filter(isRefund);
  const paymentCents = payments.reduce((sum, line) => sum + line.amountCents, 0);
  const refundCents = refunds.reduce((sum, line) => sum + line.amountCents, 0);
  const feeCents = parentCents - paymentCents - refundCents;
  const seen = new Set<string>();
  const stable = (line: BalanceLineSnapshot) => {
    const base = line.paymentIntentId || line.chargeId || line.sourceId || line.id;
    const key = seen.has(base) ? `${base}:${line.id}` : base;
    seen.add(key);
    return key;
  };
  const drafts: SplitDraft[] = [];
  for (const line of payments) {
    const linked = linkPayment(line, input.links);
    const key = stable(line);
    const gross = eurosFromCents(line.amountCents);
    const fee = eurosFromCents(line.feeCents);
    const net = eurosFromCents(line.netCents);
    drafts.push({
      revolut_transaction_id: `${input.parent.revolutTransactionId}:stripe:${key}`,
      category: "stripe_paiement",
      status: linked.posted ? "matched" : "unmatched",
      amount: gross,
      currency,
      counterparty_name: (line.name || "").trim() || (line.email || "").trim() || "Client Stripe",
      reference: linked.dossierRef || line.paymentIntentId || line.description || null,
      booked_at: input.parent.bookedAt,
      matched_customer_id: linked.posted?.customer_id || null,
      matched_transaction_id: linked.posted?.id || null,
      stripe_line: {
        kind: "paiement",
        payout_id: input.payoutId,
        payment_id: line.chargeId || line.sourceId,
        payment_intent_id: line.paymentIntentId,
        email: (line.email || "").trim() || null,
        name: (line.name || "").trim() || null,
        stripe_customer_id: linked.stripeCustomerId,
        suggestion_reason: linked.suggestionReason,
        dossier_ref: linked.dossierRef,
        customer_id: linked.customerId,
        booking_id: linked.bookingId,
        gross,
        fee,
        net,
        currency,
        deja_encaisse: Boolean(linked.posted),
      },
    });
  }
  for (const line of refunds) {
    const key = stable(line);
    drafts.push({
      revolut_transaction_id: `${input.parent.revolutTransactionId}:stripe:re:${key}`,
      category: "remboursement",
      status: "ignored",
      amount: eurosFromCents(line.amountCents),
      currency,
      counterparty_name: (line.name || "").trim() || "Remboursement Stripe",
      reference: line.description || line.paymentIntentId,
      booked_at: input.parent.bookedAt,
      matched_customer_id: null,
      matched_transaction_id: null,
      stripe_line: {
        kind: "remboursement",
        payout_id: input.payoutId,
        payment_id: line.chargeId || line.sourceId,
        payment_intent_id: line.paymentIntentId,
        email: (line.email || "").trim() || null,
        name: (line.name || "").trim() || null,
        dossier_ref: null,
        customer_id: null,
        booking_id: null,
        gross: eurosFromCents(line.amountCents),
        fee: eurosFromCents(line.feeCents),
        net: eurosFromCents(line.netCents),
        currency,
        deja_encaisse: false,
      },
    });
  }
  if (feeCents !== 0) {
    const fee = eurosFromCents(feeCents);
    drafts.push({
      revolut_transaction_id: `${input.parent.revolutTransactionId}:stripe:frais`,
      category: "frais",
      status: "ignored",
      amount: fee,
      currency,
      counterparty_name: "Frais Stripe",
      reference: "Frais d’agence",
      booked_at: input.parent.bookedAt,
      matched_customer_id: null,
      matched_transaction_id: null,
      stripe_line: {
        kind: "frais",
        payout_id: input.payoutId,
        payment_id: null,
        payment_intent_id: null,
        email: null,
        name: null,
        dossier_ref: null,
        customer_id: null,
        booking_id: null,
        gross: 0,
        fee: Math.abs(fee),
        net: fee,
        currency,
        deja_encaisse: false,
      },
    });
  }
  const sum = drafts.reduce((total, draft) => total + moneyCents(draft.amount), 0);
  if (sum !== parentCents) return { ok: false, reason: "mismatch" };
  return { ok: true, drafts };
}

/** Une synchro suivante met à jour le libellé, pas le clic déjà fait. */
export function splitWrite(
  existing: { status?: string | null } | null,
  draft: SplitDraft
): { op: "insert"; status: SplitDraft["status"] } | { op: "update"; status?: SplitDraft["status"] } | { op: "skip" } {
  if (!existing) return { op: "insert", status: draft.status };
  const status = existing.status || "unmatched";
  if (status === "matched") return { op: "update" };
  if (status === "ignored" && draft.status !== "matched") return { op: "update" };
  if (status === "ignored" && draft.status === "matched") return { op: "update", status: "matched" };
  if (draft.status === "matched") return { op: "update", status: "matched" };
  return { op: "update" };
}

export function stripeSplitSums(parentAmount: number, lines: Array<{ amount: number }>) {
  return moneyCents(parentAmount) === lines.reduce((total, line) => total + moneyCents(line.amount), 0);
}

export function stripeCacheFresh(line: StripeLineDetail | null | undefined, now: number, refresh: boolean) {
  if (!line || line.kind !== "cache") return false;
  if (line.complete) return true;
  if (refresh) return false;
  const at = line.fetched_at ? Date.parse(line.fetched_at) : Number.NaN;
  if (!Number.isFinite(at)) return false;
  return now - at < 6 * 60 * 60 * 1000;
}

export function stripePaymentExternalId(line: {
  payment_intent_id?: string | null;
  payment_id?: string | null;
} | null | undefined) {
  const intent = (line?.payment_intent_id || "").trim();
  if (intent) return intent;
  return (line?.payment_id || "").trim();
}
