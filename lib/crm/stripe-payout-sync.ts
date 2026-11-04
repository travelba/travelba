import "server-only";

import type Stripe from "stripe";
import { getStripe } from "@/lib/crm/stripe";
import { classifyStoredRevolut } from "@/lib/crm/revolut-classify";
import {
  buildStripeSplit,
  matchStripePayout,
  moneyCents,
  stripeCacheFresh,
  stripeLiveKey,
  stripePaymentExternalId,
  stripeSplitSums,
  splitWrite,
  type BalanceLineSnapshot,
  type PayoutSnapshot,
  type SplitDraft,
  type StripeLineDetail,
  type StripeLinkIndex,
} from "@/lib/crm/stripe-payout";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

const STRIPE_TIMEOUT_MS = 15_000;

type ParentRow = {
  id: string;
  revolut_transaction_id: string;
  amount: number | string;
  currency: string | null;
  booked_at: string | null;
  status: string | null;
  raw: unknown;
  counterparty_name: string | null;
  reference: string | null;
  category: string | null;
  matched_transaction_id: string | null;
  stripe_line: StripeLineDetail | null;
};

function asLine(value: unknown): StripeLineDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as StripeLineDetail;
}

function snapshotPayout(payout: Stripe.Payout): PayoutSnapshot {
  return {
    id: payout.id,
    amountCents: payout.amount,
    currency: payout.currency,
    arrivalDate: payout.arrival_date,
    created: payout.created,
    status: payout.status,
  };
}

function stringMeta(metadata: Stripe.Metadata | null | undefined) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function snapshotBalance(tx: Stripe.BalanceTransaction): BalanceLineSnapshot {
  const source = tx.source;
  const sourceObj = source && typeof source === "object" ? source : null;
  const sourceId = typeof source === "string" ? source : sourceObj && "id" in sourceObj ? String(sourceObj.id) : null;
  let paymentIntentId: string | null = null;
  let chargeId: string | null = null;
  let name: string | null = null;
  let email: string | null = null;
  let metadata: Record<string, string> = {};
  if (sourceObj && "object" in sourceObj && sourceObj.object === "charge") {
    const charge = sourceObj as Stripe.Charge;
    chargeId = charge.id;
    paymentIntentId = !charge.payment_intent
      ? null
      : typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent.id;
    name = charge.billing_details?.name || null;
    email = charge.billing_details?.email || charge.receipt_email || null;
    metadata = stringMeta(charge.metadata);
  } else if (sourceObj && "object" in sourceObj && sourceObj.object === "refund") {
    const refund = sourceObj as Stripe.Refund;
    chargeId = !refund.charge ? null : typeof refund.charge === "string" ? refund.charge : refund.charge.id;
    paymentIntentId = !refund.payment_intent
      ? null
      : typeof refund.payment_intent === "string"
        ? refund.payment_intent
        : refund.payment_intent.id;
  }
  return {
    id: tx.id,
    type: tx.type,
    amountCents: tx.amount,
    feeCents: tx.fee,
    netCents: tx.net,
    description: tx.description,
    sourceId,
    paymentIntentId,
    chargeId,
    name,
    email,
    metadata,
  };
}

async function listPages<T extends { id: string }>(
  load: (startingAfter?: string) => Promise<{ data: T[]; has_more: boolean }>
) {
  const out: T[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const list = await load(startingAfter);
    out.push(...list.data);
    if (!list.has_more) return { rows: out, complete: true };
    startingAfter = list.data.at(-1)?.id;
    if (!startingAfter) return { rows: out, complete: false };
  }
  return { rows: out, complete: false };
}

async function eachPool<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await run(items[index]);
    }
  });
  await Promise.all(workers);
}

function cacheLine(partial: Partial<StripeLineDetail> & { complete: boolean; introuvable?: boolean }): StripeLineDetail {
  return {
    kind: "cache",
    payout_id: partial.payout_id ?? null,
    payment_id: null,
    payment_intent_id: null,
    email: null,
    name: null,
    dossier_ref: null,
    customer_id: null,
    booking_id: null,
    gross: 0,
    fee: partial.fee ?? 0,
    net: partial.net ?? 0,
    currency: partial.currency || "EUR",
    deja_encaisse: false,
    complete: partial.complete,
    fetched_at: partial.fetched_at || new Date().toISOString(),
    introuvable: partial.introuvable === true,
  };
}

async function loadParents(admin: Admin) {
  const { data, error } = await admin
    .from("crm_revolut_transactions")
    .select(
      "id, revolut_transaction_id, amount, currency, booked_at, status, raw, counterparty_name, reference, category, matched_transaction_id, stripe_line"
    )
    .eq("direction", "credit")
    .is("parent_id", null)
    .neq("status", "matched")
    .order("booked_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return ((data || []) as ParentRow[]).filter((row) => {
    if (row.matched_transaction_id) return false;
    return classifyStoredRevolut(row).category === "stripe";
  });
}

async function loadChildren(admin: Admin, parentIds: string[]) {
  if (!parentIds.length) return [];
  const { data, error } = await admin
    .from("crm_revolut_transactions")
    .select("id, revolut_transaction_id, parent_id, amount, status, category, stripe_line")
    .in("parent_id", parentIds);
  if (error) throw new Error(error.message);
  return (data || []) as Array<{
    id: string;
    revolut_transaction_id: string;
    parent_id: string;
    amount: number | string;
    status: string | null;
    category: string | null;
    stripe_line: StripeLineDetail | null;
  }>;
}

async function loadLinks(admin: Admin, lines: BalanceLineSnapshot[]): Promise<StripeLinkIndex> {
  const emails = [...new Set(lines.map((line) => (line.email || "").trim()).filter(Boolean))];
  const customerIds = [
    ...new Set(
      lines
        .map((line) => (line.metadata.crm_customer_id || "").trim())
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    ),
  ];
  const stripeIds = [
    ...new Set(lines.map((line) => (line.metadata.stripe_customer_id || "").trim()).filter(Boolean)),
  ];
  const bookingIds = [
    ...new Set(
      lines
        .flatMap((line) => [line.metadata.crm_booking_id, line.metadata.booking_id])
        .map((id) => (id || "").trim())
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    ),
  ];
  const refs = [
    ...new Set(
      lines.flatMap((line) => {
        const blob = [
          line.description,
          line.metadata.reference,
          line.metadata.dossier,
          line.metadata.dossier_ref,
          line.metadata.booking_reference,
        ].join(" ");
        return [...blob.matchAll(/\bTB-\d{4}-\d{4}\b/gi)].map((match) => match[0].toUpperCase());
      })
    ),
  ];
  const externalIds = [
    ...new Set(
      lines.flatMap((line) => [line.paymentIntentId, line.chargeId, line.sourceId]).filter((id): id is string => Boolean(id))
    ),
  ];
  const [byId, byEmail, byStripe, byBookingId, byRef, posted] = await Promise.all([
    customerIds.length
      ? admin.from("crm_customers").select("id, email, stripe_customer_id").in("id", customerIds)
      : Promise.resolve({ data: [] }),
    emails.length
      ? admin
          .from("crm_customers")
          .select("id, email, stripe_customer_id")
          .or(emails.slice(0, 20).map((email) => `email.ilike.${email.replace(/[,()*]/g, "")}`).join(","))
      : Promise.resolve({ data: [] }),
    stripeIds.length
      ? admin.from("crm_customers").select("id, email, stripe_customer_id").in("stripe_customer_id", stripeIds.slice(0, 40))
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin.from("crm_bookings").select("id, reference, customer_id").in("id", bookingIds)
      : Promise.resolve({ data: [] }),
    refs.length
      ? admin.from("crm_bookings").select("id, reference, customer_id").in("reference", refs.slice(0, 40))
      : Promise.resolve({ data: [] }),
    externalIds.length
      ? admin
          .from("crm_transactions")
          .select("id, customer_id, external_id")
          .eq("source", "stripe")
          .eq("status", "posted")
          .in("external_id", externalIds.slice(0, 80))
      : Promise.resolve({ data: [] }),
  ]);
  const customers = new Map<string, { id: string; email: string | null; stripe_customer_id: string | null }>();
  for (const row of [...(byId.data || []), ...(byEmail.data || []), ...(byStripe.data || [])]) {
    if (row?.id) {
      customers.set(String(row.id), {
        id: String(row.id),
        email: row.email == null ? null : String(row.email),
        stripe_customer_id: row.stripe_customer_id == null ? null : String(row.stripe_customer_id),
      });
    }
  }
  const bookings = new Map<string, { id: string; reference: string; customer_id: string | null }>();
  for (const row of [...(byBookingId.data || []), ...(byRef.data || [])]) {
    if (row?.id) {
      bookings.set(String(row.id), {
        id: String(row.id),
        reference: String(row.reference || ""),
        customer_id: row.customer_id == null ? null : String(row.customer_id),
      });
    }
  }
  return {
    customers: [...customers.values()],
    bookings: [...bookings.values()],
    posted: ((posted.data || []) as Array<{ id: string; customer_id: string; external_id: string }>).flatMap((row) =>
      row?.id && row.external_id && !String(row.external_id).includes("#annule#")
        ? [{ id: String(row.id), customer_id: String(row.customer_id), external_id: String(row.external_id) }]
        : []
    ),
  };
}

async function rememberParent(admin: Admin, parent: ParentRow, line: StripeLineDetail, ignore: boolean) {
  const patch: Record<string, unknown> = { category: "stripe", stripe_line: line };
  if (ignore && parent.status !== "matched") patch.status = "ignored";
  await admin.from("crm_revolut_transactions").update(patch).eq("id", parent.id).neq("status", "matched");
}

async function writeDrafts(admin: Admin, parentId: string, drafts: SplitDraft[], existingByKey: Map<string, { id: string; status: string | null }>) {
  for (const draft of drafts) {
    const existing = existingByKey.get(draft.revolut_transaction_id) || null;
    const plan = splitWrite(existing, draft);
    if (plan.op === "skip") continue;
    const fields = {
      amount: draft.amount,
      currency: draft.currency,
      counterparty_name: draft.counterparty_name,
      reference: draft.reference,
      booked_at: draft.booked_at,
      stripe_line: draft.stripe_line,
      category: draft.category,
      direction: "credit",
    };
    if (plan.op === "insert") {
      await admin.from("crm_revolut_transactions").upsert(
        {
          revolut_transaction_id: draft.revolut_transaction_id,
          parent_id: parentId,
          ...fields,
          status: plan.status,
          matched_customer_id: draft.matched_customer_id,
          matched_transaction_id: draft.matched_transaction_id,
          raw: { source: "stripe", payout_id: draft.stripe_line.payout_id },
        },
        { onConflict: "revolut_transaction_id", ignoreDuplicates: true }
      );
      continue;
    }
    const patch: Record<string, unknown> = fields;
    if (plan.status) {
      patch.status = plan.status;
      patch.matched_customer_id = draft.matched_customer_id;
      patch.matched_transaction_id = draft.matched_transaction_id;
    }
    await admin.from("crm_revolut_transactions").update(patch).eq("revolut_transaction_id", draft.revolut_transaction_id);
  }
}

async function markStripeInbox(admin: Admin, externalId: string, customerId: string, transactionId: string) {
  if (!externalId) return;
  await admin
    .from("crm_stripe_transactions")
    .update({
      status: "matched",
      matched_customer_id: customerId,
      matched_transaction_id: transactionId,
    })
    .eq("stripe_payment_intent_id", externalId)
    .eq("status", "unmatched");
}

/** Relie les lignes encore ouvertes à un crédit Stripe déjà posté. Aucune écriture nouvelle. */
export async function linkPostedStripeSplits(admin: Admin) {
  const { data, error } = await admin
    .from("crm_revolut_transactions")
    .select("id, stripe_line, status")
    .eq("category", "stripe_paiement")
    .eq("status", "unmatched")
    .limit(80);
  if (error || !data?.length) return;
  const rows = data as Array<{ id: string; stripe_line: StripeLineDetail | null }>;
  const ids = [
    ...new Set(rows.flatMap((row) => [row.stripe_line?.payment_intent_id, row.stripe_line?.payment_id]).filter((id): id is string => Boolean(id))),
  ];
  if (!ids.length) return;
  const { data: posted } = await admin
    .from("crm_transactions")
    .select("id, customer_id, external_id")
    .eq("source", "stripe")
    .eq("status", "posted")
    .in("external_id", ids.slice(0, 80));
  const byExternal = new Map<string, { id: string; customer_id: string }>();
  for (const row of posted || []) {
    if (row?.external_id && !String(row.external_id).includes("#annule#")) {
      byExternal.set(String(row.external_id), { id: String(row.id), customer_id: String(row.customer_id) });
    }
  }
  for (const row of rows) {
    const externalId = stripePaymentExternalId(row.stripe_line);
    const hit = (row.stripe_line?.payment_intent_id && byExternal.get(row.stripe_line.payment_intent_id)) || byExternal.get(externalId);
    if (!hit || !row.stripe_line) continue;
    await admin
      .from("crm_revolut_transactions")
      .update({
        status: "matched",
        matched_customer_id: hit.customer_id,
        matched_transaction_id: hit.id,
        stripe_line: { ...row.stripe_line, deja_encaisse: true, customer_id: row.stripe_line.customer_id || hit.customer_id },
      })
      .eq("id", row.id)
      .eq("status", "unmatched");
    await markStripeInbox(admin, externalId, hit.customer_id, hit.id);
  }
}

/**
 * Découpe les versements Stripe encore entiers. Une fois le cache complet, plus d’appel Stripe.
 * `refresh` relance un versement introuvable (bouton Synchroniser).
 */
export async function splitPendingStripePayouts(admin: Admin, opts?: { refresh?: boolean; now?: number }) {
  const now = opts?.now ?? Date.now();
  try {
    await linkPostedStripeSplits(admin);
  } catch (err) {
    console.error("[revolut] stripe déjà encaissé", err instanceof Error ? err.message : "échec");
  }
  let parents: ParentRow[] = [];
  try {
    parents = await loadParents(admin);
  } catch (err) {
    console.error("[revolut] versements stripe", err instanceof Error ? err.message : "échec");
    return;
  }
  if (!parents.length) return;
  const children = await loadChildren(
    admin,
    parents.map((row) => row.id)
  ).catch(() => []);
  const childrenOf = new Map<string, typeof children>();
  for (const child of children) {
    const list = childrenOf.get(child.parent_id) || [];
    list.push(child);
    childrenOf.set(child.parent_id, list);
  }
  const pending = parents.filter((parent) => {
    const own = childrenOf.get(parent.id) || [];
    const cache = asLine(parent.stripe_line);
    if (own.length && cache?.complete && stripeSplitSums(Number(parent.amount), own.map((row) => ({ amount: Number(row.amount) })))) return false;
    if (stripeCacheFresh(cache, now, opts?.refresh === true)) return false;
    return true;
  });
  if (!pending.length) return;
  if (!stripeLiveKey(process.env.STRIPE_SECRET_KEY)) return;
  const stripe = getStripe();
  if (!stripe) return;
  const booked = pending
    .map((row) => (row.booked_at ? Date.parse(row.booked_at) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!booked.length) return;
  const from = Math.floor((Math.min(...booked) - 3 * 24 * 60 * 60 * 1000) / 1000);
  const to = Math.floor((Math.max(...booked) + 3 * 24 * 60 * 60 * 1000) / 1000);
  let payouts: PayoutSnapshot[] = [];
  try {
    const listed = await listPages((startingAfter) =>
      stripe.payouts.list(
        { arrival_date: { gte: from, lte: to }, limit: 100, starting_after: startingAfter },
        { timeout: STRIPE_TIMEOUT_MS }
      )
    );
    payouts = listed.rows.map(snapshotPayout);
    if (!listed.complete) {
      console.error("[revolut] liste des versements Stripe incomplète");
    }
  } catch (err) {
    console.error("[revolut] versements Stripe", err instanceof Error ? err.message : "échec");
    return;
  }
  await eachPool(pending, 3, async (parent) => {
    const payout = matchStripePayout(
      { amount: Number(parent.amount), currency: parent.currency || "EUR", bookedAt: parent.booked_at },
      payouts
    );
    if (!payout) {
      await rememberParent(
        admin,
        parent,
        cacheLine({ complete: false, introuvable: true, currency: parent.currency || "EUR", fetched_at: new Date(now).toISOString() }),
        false
      );
      return;
    }
    let balance: BalanceLineSnapshot[] = [];
    let complete = true;
    try {
      const listed = await listPages((startingAfter) =>
        stripe.balanceTransactions.list(
          { payout: payout.id, limit: 100, starting_after: startingAfter, expand: ["data.source"] },
          { timeout: STRIPE_TIMEOUT_MS }
        )
      );
      balance = listed.rows.map(snapshotBalance);
      complete = listed.complete;
    } catch (err) {
      console.error("[revolut] détail Stripe", err instanceof Error ? err.message : "échec");
      return;
    }
    if (!complete) {
      await rememberParent(
        admin,
        parent,
        cacheLine({
          complete: false,
          payout_id: payout.id,
          currency: parent.currency || "EUR",
          fetched_at: new Date(now).toISOString(),
        }),
        false
      );
      return;
    }
    const links = await loadLinks(admin, balance);
    const built = buildStripeSplit({
      parent: {
        revolutTransactionId: parent.revolut_transaction_id,
        amount: Number(parent.amount),
        currency: parent.currency || "EUR",
        bookedAt: parent.booked_at,
      },
      payoutId: payout.id,
      balance,
      links,
    });
    if (!built.ok) {
      console.error("[revolut] somme Stripe différente du versement");
      await rememberParent(
        admin,
        parent,
        cacheLine({ complete: false, payout_id: payout.id, currency: parent.currency || "EUR", fetched_at: new Date(now).toISOString() }),
        false
      );
      return;
    }
    const existing = new Map(
      (childrenOf.get(parent.id) || []).map((row) => [row.revolut_transaction_id, { id: row.id, status: row.status }])
    );
    await writeDrafts(admin, parent.id, built.drafts, existing);
    const fee = built.drafts.find((draft) => draft.category === "frais");
    await rememberParent(
      admin,
      parent,
      cacheLine({
        complete: true,
        payout_id: payout.id,
        fee: fee ? Math.abs(fee.amount) : 0,
        net: fee?.amount ?? 0,
        currency: parent.currency || "EUR",
        fetched_at: new Date(now).toISOString(),
      }),
      moneyCents(Number(parent.amount)) === built.drafts.reduce((sum, draft) => sum + moneyCents(draft.amount), 0)
    );
    for (const draft of built.drafts) {
      if (draft.status !== "matched" || !draft.matched_transaction_id || !draft.matched_customer_id) continue;
      await markStripeInbox(admin, stripePaymentExternalId(draft.stripe_line), draft.matched_customer_id, draft.matched_transaction_id);
    }
  });
}
