import type Stripe from "stripe";
import { getStripe } from "@/lib/crm/stripe";
import {
  stripeCrmPayerName,
  STRIPE_PAYER_RESOLUTION,
  stripeInboxFromIntent,
  stripeInboxRefreshPatch,
  stripeIntentIdsToRefresh,
  stripeIntentInputFromSnapshot,
  stripeNeedsCheckoutPayer,
  stripeRawNeedsPayerRefresh,
  type StripeCheckoutHint,
  type StripeCrmBooking,
  type StripeCrmCustomer,
  type StripeIntentInput,
} from "@/lib/crm/stripe-inbox";
import { autoMatchUnmatchedStripe } from "@/lib/crm/stripe-match";

const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const BACKFILL_LIMIT = 80;
const STRIPE_CONCURRENCY = 4;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeAdmin = { from: (table: string) => any };

export function snapshotFromPaymentIntent(intent: Stripe.PaymentIntent): StripeIntentInput {
  return stripeIntentInputFromSnapshot(intent);
}

function intentNeedsExpand(intent: Stripe.PaymentIntent) {
  if (typeof intent.customer === "string") return true;
  if (typeof intent.latest_charge === "string") return true;
  const charge = intent.latest_charge;
  return Boolean(charge && typeof charge === "object" && typeof charge.customer === "string");
}

async function expandIntent(stripe: Stripe, intent: Stripe.PaymentIntent) {
  if (!intentNeedsExpand(intent)) return intent;
  try {
    return await stripe.paymentIntents.retrieve(intent.id, {
      expand: ["latest_charge", "customer", "latest_charge.customer"],
    });
  } catch {
    console.error("[stripe] lecture", intent.id);
    return intent;
  }
}

async function checkoutHint(stripe: Stripe, paymentIntentId: string): Promise<StripeCheckoutHint & { failed: boolean }> {
  try {
    const list = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
    const details = list.data[0]?.customer_details;
    return {
      name: details?.name ?? null,
      businessName: details?.business_name ?? null,
      individualName: details?.individual_name ?? null,
      email: details?.email ?? null,
      failed: false,
    };
  } catch {
    console.error("[stripe] session", paymentIntentId);
    return { failed: true };
  }
}

async function mapPool<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      await run(items[current]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

async function attachCrmPayerNames(admin: StripeAdmin, inputs: StripeIntentInput[]) {
  const customerIds = [
    ...new Set(inputs.map((input) => (input.metadata?.crm_customer_id || "").trim()).filter(Boolean)),
  ];
  const references = [...new Set(inputs.map((input) => (input.metadata?.reference || "").trim()).filter(Boolean))];
  let customers: StripeCrmCustomer[] = [];
  let bookings: StripeCrmBooking[] = [];
  try {
    if (customerIds.length) {
      const listed = await admin
        .from("crm_customers")
        .select("id, first_name, last_name, company_name")
        .in("id", customerIds);
      customers = ((listed?.data || []) as StripeCrmCustomer[]).filter((row) => row?.id);
    }
    if (references.length) {
      const listed = await admin
        .from("crm_bookings")
        .select("reference, customer_id, billing_customer_id")
        .in("reference", references);
      const found = ((listed?.data || []) as StripeCrmBooking[]).filter((row) => row?.reference);
      const payerIds = [
        ...new Set(
          found
            .map((row) => (row.billing_customer_id || row.customer_id || "").trim())
            .filter((id) => id && !customers.some((customer) => customer.id === id))
        ),
      ];
      if (payerIds.length) {
        const payers = await admin
          .from("crm_customers")
          .select("id, first_name, last_name, company_name")
          .in("id", payerIds);
        customers = customers.concat(((payers?.data || []) as StripeCrmCustomer[]).filter((row) => row?.id));
      }
      bookings = found;
    }
  } catch {
    console.error("[stripe] clients");
  }
  return inputs.map((input) => ({
    ...input,
    crmPayerName: stripeCrmPayerName(input.metadata, customers, bookings),
  }));
}

export async function inboxInputsFromPaymentIntents(
  stripe: Stripe,
  admin: StripeAdmin,
  intents: Stripe.PaymentIntent[]
) {
  const expanded: { intent: Stripe.PaymentIntent; expandFailed: boolean }[] = [];
  await mapPool(intents, STRIPE_CONCURRENCY, async (intent) => {
    const next = await expandIntent(stripe, intent);
    expanded.push({ intent: next, expandFailed: intentNeedsExpand(next) });
  });
  const failedIds = new Set(expanded.filter((item) => item.expandFailed).map((item) => item.intent.id));
  const named = await attachCrmPayerNames(
    admin,
    expanded.map((item) => snapshotFromPaymentIntent(item.intent))
  );
  const withCheckout: StripeIntentInput[] = [];
  await mapPool(named, STRIPE_CONCURRENCY, async (input) => {
    const expandFailed = Boolean(input.id && failedIds.has(input.id));
    if (!stripeNeedsCheckoutPayer(input) || !input.id) {
      withCheckout.push({ ...input, payerResolved: !expandFailed || Boolean(input.crmPayerName || input.charge?.name) });
      return;
    }
    const checkout = await checkoutHint(stripe, input.id);
    const namedAfter = Boolean(checkout.name || checkout.businessName || checkout.individualName || checkout.email);
    withCheckout.push({
      ...input,
      checkout,
      payerResolved: (!checkout.failed && !expandFailed) || namedAfter,
    });
  });
  return withCheckout;
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
      expand: ["data.latest_charge", "data.customer", "data.latest_charge.customer"],
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
    const fields = stripeInboxRefreshPatch(draft);
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

async function stalePaymentIntentIds(admin: StripeAdmin, already: ReadonlySet<string>) {
  try {
    const listed = await admin
      .from("crm_stripe_transactions")
      .select("stripe_payment_intent_id, raw")
      .or(`raw->>payer_resolution.is.null,raw->>payer_resolution.neq.${STRIPE_PAYER_RESOLUTION}`)
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(BACKFILL_LIMIT * 4);
    if (!listed?.error && Array.isArray(listed?.data)) {
      return stripeIntentIdsToRefresh(listed.data, already, BACKFILL_LIMIT);
    }
  } catch {
    /* repli plus bas */
  }
  try {
    const listed = await admin
      .from("crm_stripe_transactions")
      .select("stripe_payment_intent_id, raw")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(500);
    const rows = ((listed?.data || []) as { stripe_payment_intent_id?: string; raw?: unknown }[]).filter((row) =>
      stripeRawNeedsPayerRefresh(row.raw)
    );
    return stripeIntentIdsToRefresh(rows, already, BACKFILL_LIMIT);
  } catch {
    console.error("[stripe] relecture");
    return [];
  }
}

export async function syncStripeInbox(admin: StripeAdmin, now = Date.now()) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe n’est pas configuré");
  const since = Math.floor((now - LOOKBACK_MS) / 1000);
  const intents = await fetchSucceededPaymentIntents(since);
  const seen = new Set(intents.map((intent) => intent.id));
  const staleIds = await stalePaymentIntentIds(admin, seen);
  const older: Stripe.PaymentIntent[] = [];
  await mapPool(staleIds, STRIPE_CONCURRENCY, async (id) => {
    try {
      older.push(
        await stripe.paymentIntents.retrieve(id, {
          expand: ["latest_charge", "customer", "latest_charge.customer"],
        })
      );
    } catch {
      console.error("[stripe] relecture", id);
    }
  });
  const inputs = await inboxInputsFromPaymentIntents(stripe, admin, [...intents, ...older]);
  const inserted = await upsertStripeInbox(admin, inputs);
  const auto = await autoMatchUnmatchedStripe();
  return { fetched: intents.length, inserted, refreshed: older.length, auto_matched: auto.matched };
}
