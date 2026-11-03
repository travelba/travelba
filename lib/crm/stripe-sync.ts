import type Stripe from "stripe";
import { getStripe } from "@/lib/crm/stripe";
import { stripeInboxFromIntent, type StripeChargeHint, type StripeInboxDraft, type StripeIntentInput } from "@/lib/crm/stripe-inbox";
import { autoMatchUnmatchedStripe } from "@/lib/crm/stripe-match";
import {
  STRIPE_FIRST_LOOKBACK_MS,
  STRIPE_OVERLAP_MS,
  stripeStoredMatches,
  syncSinceUnix,
  type StripeStoredRow,
} from "@/lib/crm/sync-delta";
import { SYNC_WATERMARK, readSyncWatermark, writeSyncWatermark } from "@/lib/crm/sync-watermark";

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
      .select("id, customer_id, external_id, status")
      .eq("source", "stripe")
      .eq("status", "posted")
      .in("external_id", slice);
    for (const row of data || []) {
      if (row?.external_id && row.id && row.status !== "void" && !String(row.external_id).includes("#annule#")) {
        found.set(String(row.external_id), { id: String(row.id), customer_id: String(row.customer_id) });
      }
    }
  }
  return found;
}

const INBOX_COLUMNS =
  "stripe_payment_intent_id, amount, currency, direction, payer_name, payer_email, reference, method, last4, booked_at, raw, status";

async function inboxByIntent(admin: StripeAdmin, ids: string[]) {
  const found = new Map<string, StripeStoredRow>();
  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    if (!slice.length) continue;
    const { data } = await admin.from("crm_stripe_transactions").select(INBOX_COLUMNS).in("stripe_payment_intent_id", slice);
    for (const row of data || []) {
      const id = String(row?.stripe_payment_intent_id || "");
      if (id) found.set(id, row as StripeStoredRow);
    }
  }
  return found;
}

function stripeFields(draft: StripeInboxDraft) {
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

export async function upsertStripeInbox(admin: StripeAdmin, intents: StripeIntentInput[]) {
  const drafts = intents.flatMap((intent) => {
    const draft = stripeInboxFromIntent(intent);
    return draft ? [draft] : [];
  });
  const ids = drafts.map((draft) => draft.stripe_payment_intent_id);
  const [linked, inbox] = await Promise.all([ledgerByIntent(admin, ids), inboxByIntent(admin, ids)]);
  let inserted = 0;
  for (const draft of drafts) {
    const existing = linked.get(draft.stripe_payment_intent_id);
    const fields = stripeFields(draft);
    const row = inbox.get(draft.stripe_payment_intent_id) || null;
    if (!row) {
      const { error, data } = await admin
        .from("crm_stripe_transactions")
        .upsert(
          { stripe_payment_intent_id: draft.stripe_payment_intent_id, ...fields },
          { onConflict: "stripe_payment_intent_id", ignoreDuplicates: true }
        )
        .select("id");
      if (!error && data?.length) inserted += data.length;
      else if (!stripeStoredMatches(row, fields)) {
        await admin.from("crm_stripe_transactions").update(fields).eq("stripe_payment_intent_id", draft.stripe_payment_intent_id);
      }
    } else if (!stripeStoredMatches(row, fields)) {
      await admin.from("crm_stripe_transactions").update(fields).eq("stripe_payment_intent_id", draft.stripe_payment_intent_id);
    }
    if (existing && row?.status !== "matched" && row?.status !== "ignored") {
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
  const cursor = await readSyncWatermark(SYNC_WATERMARK.stripe);
  const since = syncSinceUnix({
    cursor,
    now,
    overlapMs: STRIPE_OVERLAP_MS,
    firstLookbackMs: STRIPE_FIRST_LOOKBACK_MS,
  });
  const intents = await fetchSucceededPaymentIntents(since);
  const inserted = await upsertStripeInbox(admin, intents.map(snapshotFromPaymentIntent));
  await writeSyncWatermark(SYNC_WATERMARK.stripe, new Date(now).toISOString());
  const auto = await autoMatchUnmatchedStripe();
  return { fetched: intents.length, inserted, auto_matched: auto.matched, since };
}
