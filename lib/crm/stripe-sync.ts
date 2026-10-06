import type Stripe from "stripe";
import { getStripe } from "@/lib/crm/stripe";
import { stripeInboxFromIntent, type StripeChargeHint, type StripeIntentInput } from "@/lib/crm/stripe-inbox";
import { autoMatchUnmatchedStripe } from "@/lib/crm/stripe-match";

const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeAdmin = { from: (table: string) => any };

export function snapshotFromPaymentIntent(intent: Stripe.PaymentIntent): StripeIntentInput {
  const charge = intent.latest_charge;
  const details =
    charge && typeof charge !== "string" ? charge.payment_method_details : null;
  const card = details && details.type === "card" ? details.card : null;
  const hint: StripeChargeHint | null =
    charge && typeof charge !== "string"
      ? {
          name: charge.billing_details?.name ?? null,
          email: charge.billing_details?.email ?? null,
          type: details?.type ?? null,
          last4: card?.last4 ?? null,
          wallet: card?.wallet?.type ?? null,
        }
      : null;
  const customer = intent.customer;
  return {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    description: intent.description,
    receiptEmail: intent.receipt_email,
    created: intent.created,
    customerId: !customer ? null : typeof customer === "string" ? customer : customer.id,
    metadata: intent.metadata,
    charge: hint,
  };
}

export async function fetchSucceededPaymentIntents(sinceUnix: number) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe n’est pas configuré");
  const out: Stripe.PaymentIntent[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const list = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: sinceUnix },
      starting_after: startingAfter,
      expand: ["data.latest_charge"],
    });
    out.push(...list.data.filter((intent) => intent.status === "succeeded"));
    if (!list.has_more) break;
    startingAfter = list.data.at(-1)?.id;
    if (!startingAfter) break;
  }
  return out;
}

async function ledgerByIntent(admin: StripeAdmin, ids: string[]) {
  const found = new Map<string, { id: string; customer_id: string }>();
  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    if (!slice.length) continue;
    const { data } = await admin
      .from("crm_transactions")
      .select("id, customer_id, external_id")
      .eq("source", "stripe")
      .in("external_id", slice);
    for (const row of data || []) {
      if (row?.external_id && row.id) {
        found.set(String(row.external_id), { id: String(row.id), customer_id: String(row.customer_id) });
      }
    }
  }
  return found;
}

export async function upsertStripeInbox(admin: StripeAdmin, intents: StripeIntentInput[]) {
  const drafts = intents.flatMap((intent) => {
    const draft = stripeInboxFromIntent(intent);
    return draft ? [draft] : [];
  });
  const linked = await ledgerByIntent(
    admin,
    drafts.map((draft) => draft.stripe_payment_intent_id)
  );
  let inserted = 0;
  for (const draft of drafts) {
    const existing = linked.get(draft.stripe_payment_intent_id);
    const fields = {
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
    const { error, data } = await admin
      .from("crm_stripe_transactions")
      .upsert(
        { stripe_payment_intent_id: draft.stripe_payment_intent_id, ...fields },
        { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true }
      )
      .select("id");
    if (!error && data?.length) inserted += data.length;
    else {
      await admin
        .from("crm_stripe_transactions")
        .update(fields)
        .eq("stripe_payment_intent_id", draft.stripe_payment_intent_id);
    }
    if (existing) {
      await admin
        .from("crm_stripe_transactions")
        .update({
          status: "matched",
          matched_customer_id: existing.customer_id,
          matched_transaction_id: existing.id,
        })
        .eq("stripe_payment_intent_id", draft.stripe_payment_intent_id)
        .eq("status", "unmatched");
    }
  }
  return inserted;
}

export async function syncStripeInbox(admin: StripeAdmin, now = Date.now()) {
  const since = Math.floor((now - LOOKBACK_MS) / 1000);
  const intents = await fetchSucceededPaymentIntents(since);
  const inserted = await upsertStripeInbox(admin, intents.map(snapshotFromPaymentIntent));
  const auto = await autoMatchUnmatchedStripe();
  return { fetched: intents.length, inserted, auto_matched: auto.matched };
}
