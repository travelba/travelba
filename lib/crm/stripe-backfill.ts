import type Stripe from "stripe";
import { snapshotFromPaymentIntent } from "@/lib/crm/stripe-snapshot";
import { createStripeCustomerCache, lookupStripePayer } from "@/lib/crm/stripe-payer-fetch";
import { formatMoney } from "@/lib/crm/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export type StripePayerFill = {
  id: string;
  montant: string;
  nom: string | null;
  email: string | null;
};

const PAGE = 100;
const CEILING = 5000;

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type OpenRow = {
  id: string;
  stripe_payment_intent_id: string;
  amount: number | string;
  currency: string | null;
  payer_name: string | null;
  payer_email: string | null;
};

async function unmatchedMissing(admin: Admin) {
  const rows: OpenRow[] = [];
  for (let from = 0; from < CEILING; from += PAGE) {
    const { data, error } = await admin
      .from("crm_stripe_transactions")
      .select("id, stripe_payment_intent_id, amount, currency, payer_name, payer_email, status, direction")
      .eq("status", "unmatched")
      .eq("direction", "credit")
      .or("payer_name.is.null,payer_email.is.null")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error("Lecture impossible.");
    const page = (data || []) as OpenRow[];
    for (const row of page) {
      if (!clean(row.payer_name) || !clean(row.payer_email)) rows.push(row);
    }
    if (page.length < PAGE) return { rows, reste: false };
  }
  return { rows, reste: true };
}

/**
 * Relit Stripe pour les paiements encore ouverts sans nom ou sans e-mail.
 * Sans confirmer, rien n'est écrit. confirmer ne touche que payer_name et payer_email.
 */
export async function backfillStripePayers(admin: Admin, stripe: Stripe, confirm: boolean) {
  const { rows, reste } = await unmatchedMissing(admin);
  const cache = createStripeCustomerCache();
  const lignes: StripePayerFill[] = [];
  let ecrit = 0;
  for (const row of rows) {
    const intentId = clean(row.stripe_payment_intent_id);
    if (!intentId) continue;
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
    } catch (err) {
      console.error("[stripe] relecture", err instanceof Error ? err.message : "lecture");
      continue;
    }
    const base = snapshotFromPaymentIntent(intent);
    const payer = await lookupStripePayer(
      stripe,
      {
        intentId: intent.id,
        customerId: base.customerId,
        invoiceId: null,
        billingEmail: base.charge?.email,
        billingName: base.charge?.name,
        receiptEmail: base.receiptEmail,
        description: base.description,
        metadata: base.metadata,
      },
      cache
    );
    const nom = clean(row.payer_name) || payer.name;
    const email = clean(row.payer_email) || payer.email;
    const patch: { payer_name?: string; payer_email?: string } = {};
    if (!clean(row.payer_name) && payer.name) patch.payer_name = payer.name;
    if (!clean(row.payer_email) && payer.email) patch.payer_email = payer.email;
    if (!patch.payer_name && !patch.payer_email) continue;
    lignes.push({
      id: row.id,
      montant: formatMoney(Number(row.amount), row.currency || "EUR"),
      nom,
      email,
    });
    if (!confirm) continue;
    const { error } = await admin
      .from("crm_stripe_transactions")
      .update(patch)
      .eq("id", row.id)
      .eq("status", "unmatched");
    if (!error) ecrit += 1;
  }
  return { confirmer: confirm, ecrit: confirm ? ecrit : 0, lignes, reste };
}
