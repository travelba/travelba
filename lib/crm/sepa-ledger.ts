import "server-only";
import type Stripe from "stripe";
import { recordClientPayAlert } from "@/lib/crm/agency-log";
import { formatMoney } from "@/lib/crm/money";
import {
  disputeSepaAlert,
  eurosFromCents,
  isSepaLockId,
  mandateRevokedAlert,
  sepaFailuresFromRows,
  sepaHoldsFromRows,
  orphanSepaIdsToCancel,
  planSepaLedger,
  readSepaIntent,
  sepaFailureAlert,
  sepaLast4,
  sepaLockId,
  type SepaIntentView,
  type SepaReading,
} from "@/lib/crm/sepa-hold";
import { getStripe, stripeConfigured } from "@/lib/crm/stripe";
import { stripeFailureCode } from "@/lib/crm/client-pay";
import { paymentCreditReleased } from "@/lib/crm/unmatch-credit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SepaAdmin = { from: (table: string) => any };

const LOCK_TTL_MS = 2 * 60 * 1000;

export function viewFromStripeIntent(intent: Stripe.PaymentIntent): SepaIntentView {
  const charge = intent.latest_charge && typeof intent.latest_charge !== "string" ? intent.latest_charge : null;
  const details = charge?.payment_method_details;
  const sepa = details && details.type === "sepa_debit" ? details.sepa_debit : null;
  const method = intent.payment_method;
  return {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    created: intent.created,
    metadata: intent.metadata || null,
    paymentMethodTypes: intent.payment_method_types || null,
    paymentMethodId: !method ? null : typeof method === "string" ? method : method.id,
    chargeStatus: charge?.status || null,
    chargeType: details?.type || null,
    chargeLast4: sepa?.last4 || null,
    failureCode: intent.last_payment_error?.code || charge?.failure_code || null,
  };
}

function customerOf(intent: Stripe.PaymentIntent, fallback?: string) {
  const metaId = (intent.metadata?.crm_customer_id || "").trim();
  if (metaId) return metaId;
  return (fallback || "").trim();
}

async function existingCredit(admin: SepaAdmin, paymentIntentId: string) {
  const { data } = await admin
    .from("crm_transactions")
    .select("id, status, external_id, customer_id")
    .eq("source", "stripe")
    .eq("external_id", paymentIntentId)
    .maybeSingle();
  return (data || null) as { id: string; status: string; external_id: string; customer_id: string } | null;
}

function rowFrom(intent: Stripe.PaymentIntent, reading: Exclude<SepaReading, { kind: "ignore" } | { kind: "orphan" }>, customerId: string) {
  const flight = reading.flight;
  return {
    customer_id: customerId,
    booking_id: null,
    billing_company_id: flight.companyId || null,
    payer_kind: flight.payer,
    direction: "credit" as const,
    kind: "transfer" as const,
    currency: flight.currency,
    source: "stripe" as const,
    external_id: flight.paymentIntentId,
  };
}

async function writePlan(
  admin: SepaAdmin,
  intent: Stripe.PaymentIntent,
  reading: Exclude<SepaReading, { kind: "ignore" } | { kind: "orphan" }>,
  customerId: string,
  existing: { id: string; status: string } | null
) {
  const plan = planSepaLedger(existing, reading, false);
  if (plan.action === "keep") return { action: "keep" as const, changed: false };
  const base = rowFrom(intent, reading, customerId);
  const amount = plan.action === "void" ? eurosFromCents(reading.flight.amountCents) : plan.amount;
  const fields = {
    ...base,
    amount,
    label: plan.label,
    status: plan.action === "pending" ? "pending" : plan.action === "post" ? "posted" : "void",
    occurred_on: plan.action === "void" ? undefined : plan.occurredOn,
  };
  if (existing) {
    const patch: Record<string, unknown> = {
      status: fields.status,
      label: fields.label,
      amount: fields.amount,
      payer_kind: fields.payer_kind,
      billing_company_id: fields.billing_company_id,
    };
    if (fields.occurred_on) patch.occurred_on = fields.occurred_on;
    const { error } = await admin.from("crm_transactions").update(patch).eq("id", existing.id);
    if (error) return { action: plan.action, changed: false, error: error.message as string };
    return { action: plan.action, changed: existing.status !== fields.status, label: fields.label };
  }
  const insert = { ...fields, occurred_on: fields.occurred_on || new Date().toISOString().slice(0, 10) };
  const { error } = await admin.from("crm_transactions").insert(insert);
  if (!error) return { action: plan.action, changed: true, label: fields.label };
  if (!/duplicate|unique/i.test(String(error.message || ""))) {
    return { action: plan.action, changed: false, error: error.message as string };
  }
  const again = await existingCredit(admin, reading.flight.paymentIntentId);
  if (!again || again.status === "posted") return { action: "keep" as const, changed: false };
  const { error: updateError } = await admin
    .from("crm_transactions")
    .update({ status: fields.status, label: fields.label, amount: fields.amount })
    .eq("id", again.id);
  if (updateError) return { action: plan.action, changed: false, error: updateError.message as string };
  return { action: plan.action, changed: true, label: fields.label };
}

/** Pose, promeut ou retire la réservation. Aucun e-mail, aucun WhatsApp. */
export async function syncSepaIntent(
  admin: SepaAdmin,
  intent: Stripe.PaymentIntent,
  opts?: { customerId?: string }
) {
  const reading = readSepaIntent(viewFromStripeIntent(intent));
  if (reading.kind === "ignore" || reading.kind === "orphan") return { ok: true as const, action: "keep" as const };
  const customerId = customerOf(intent, opts?.customerId);
  if (!customerId) return { ok: true as const, action: "keep" as const };
  if (opts?.customerId && (intent.metadata?.crm_customer_id || "").trim() && intent.metadata.crm_customer_id !== opts.customerId) {
    return { ok: true as const, action: "keep" as const };
  }
  if (await paymentCreditReleased(admin, "stripe", reading.flight.paymentIntentId)) {
    return { ok: true as const, action: "keep" as const };
  }
  const existing = await existingCredit(admin, reading.flight.paymentIntentId);
  if (existing && existing.customer_id && existing.customer_id !== customerId) {
    return { ok: true as const, action: "keep" as const };
  }
  const wrote = await writePlan(admin, intent, reading, customerId, existing);
  if ("error" in wrote && wrote.error) {
    console.error("[sepa] écriture", reading.flight.paymentIntentId);
    return { ok: false as const, action: wrote.action, error: wrote.error };
  }
  if (wrote.action === "void" && wrote.changed && reading.kind === "failed") {
    const part = reading.flight.mention || (reading.flight.payer === "personal" ? "Particulier" : "Société");
    await recordClientPayAlert({
      customerId,
      summary: sepaFailureAlert({
        partLabel: part,
        amountLabel: formatMoney(eurosFromCents(reading.flight.amountCents), reading.flight.currency),
        last4: reading.flight.last4,
        message: reading.message,
      }),
    });
  }
  if (wrote.action === "void" && wrote.changed && reading.kind === "canceled") {
    const part = reading.flight.mention || (reading.flight.payer === "personal" ? "Particulier" : "Société");
    await recordClientPayAlert({
      customerId,
      summary: `Prélèvement annulé · ${part} · ${formatMoney(eurosFromCents(reading.flight.amountCents), reading.flight.currency)}. Le client peut le relancer, ou payer par carte ou par virement.`.slice(0, 240),
    });
  }
  return { ok: true as const, action: wrote.action };
}

export async function cancelOrphanSepaIntents(stripe: Stripe, intents: Stripe.PaymentIntent[]) {
  const ids = orphanSepaIdsToCancel(intents.map(viewFromStripeIntent));
  for (const id of ids) {
    const current = intents.find((intent) => intent.id === id);
    if (current && current.status !== "requires_payment_method") continue;
    try {
      await stripe.paymentIntents.cancel(id);
    } catch (err) {
      console.error("[sepa] formulaire", stripeFailureCode(err));
    }
  }
}

/** Relit Stripe pour ce client : réserve, encaisse, ou retire. Annule les formulaires ouverts du même montant. */
export async function reconcileCustomerSepa(
  admin: SepaAdmin,
  customer: { id: string; stripeCustomerId: string | null | undefined }
) {
  if (!customer.stripeCustomerId || !stripeConfigured()) return { ok: true as const, skipped: true as const };
  const stripe = getStripe();
  if (!stripe) return { ok: true as const, skipped: true as const };
  try {
    const listed = await stripe.paymentIntents.list({
      customer: customer.stripeCustomerId,
      limit: 40,
      expand: ["data.latest_charge"],
    });
    for (const intent of listed.data) {
      const result = await syncSepaIntent(admin, intent, { customerId: customer.id });
      if (!result.ok) return { ok: false as const, error: result.error };
    }
    // Une page ne cancel jamais un PaymentIntent. Seul le cron stripe-sync le fait.
    await releaseStaleSepaLocks(admin, customer.id);
    return { ok: true as const, skipped: false as const };
  } catch (err) {
    console.error("[sepa] rapprochement", stripeFailureCode(err));
    return { ok: false as const, error: "stripe" };
  }
}

export async function claimSepaLock(
  admin: SepaAdmin,
  input: { customerId: string; payer: "company" | "personal"; companyId: string; amount: number; currency: string }
) {
  const externalId = sepaLockId(input.customerId, input.payer, input.companyId);
  const row = {
    customer_id: input.customerId,
    booking_id: null,
    billing_company_id: input.companyId || null,
    payer_kind: input.payer,
    direction: "credit" as const,
    kind: "transfer" as const,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    occurred_on: new Date().toISOString().slice(0, 10),
    label: "Verrou prélèvement",
    source: "stripe" as const,
    external_id: externalId,
    status: "pending" as const,
  };
  const inserted = await admin.from("crm_transactions").insert(row);
  if (!inserted.error) return true;
  if (!/duplicate|unique/i.test(String(inserted.error.message || ""))) {
    console.error("[sepa] verrou", inserted.error.code || "insert");
    return false;
  }
  const { data } = await admin
    .from("crm_transactions")
    .select("id, created_at, status")
    .eq("source", "stripe")
    .eq("external_id", externalId)
    .maybeSingle();
  const created = Date.parse(data?.created_at || "");
  if (data?.status === "pending" && Number.isFinite(created) && Date.now() - created < LOCK_TTL_MS) return false;
  if (data?.id) await admin.from("crm_transactions").delete().eq("id", data.id).eq("status", "pending");
  const again = await admin.from("crm_transactions").insert(row);
  return !again.error;
}

export async function releaseSepaLock(
  admin: SepaAdmin,
  input: { customerId: string; payer: string; companyId: string }
) {
  const externalId = sepaLockId(input.customerId, input.payer, input.companyId);
  if (!isSepaLockId(externalId)) return;
  await admin.from("crm_transactions").delete().eq("source", "stripe").eq("external_id", externalId).eq("status", "pending");
}

async function releaseStaleSepaLocks(admin: SepaAdmin, customerId: string) {
  const { data } = await admin
    .from("crm_transactions")
    .select("id, external_id, created_at, status")
    .eq("customer_id", customerId)
    .eq("source", "stripe")
    .eq("status", "pending")
    .like("external_id", `sepa-lock:${customerId}:%`);
  const now = Date.now();
  for (const row of data || []) {
    if (!isSepaLockId(row.external_id)) continue;
    const created = Date.parse(row.created_at || "");
    if (!Number.isFinite(created) || now - created < LOCK_TTL_MS) continue;
    await admin.from("crm_transactions").delete().eq("id", row.id).eq("status", "pending");
  }
}

export async function syncSepaIntents(admin: SepaAdmin, intents: Stripe.PaymentIntent[]) {
  for (const intent of intents) {
    const types = intent.payment_method_types || [];
    const sepa = intent.metadata?.pay_method === "sepa_debit" || types.includes("sepa_debit");
    if (!sepa) continue;
    const result = await syncSepaIntent(admin, intent);
    if (!result.ok) return result;
  }
  const stripe = getStripe();
  if (stripe) {
    const groups = new Map<string, Stripe.PaymentIntent[]>();
    for (const intent of intents) {
      const customer = intent.customer;
      const id = !customer ? "" : typeof customer === "string" ? customer : customer.id;
      if (!id) continue;
      const group = groups.get(id) || [];
      group.push(intent);
      groups.set(id, group);
    }
    for (const group of groups.values()) await cancelOrphanSepaIntents(stripe, group);
  }
  return { ok: true as const };
}

export async function alertSepaReturned(input: {
  customerId: string;
  amountCents: number;
  currency: string;
  paymentIntentId: string;
  kind: "refund" | "dispute";
}) {
  if (!input.customerId || !input.paymentIntentId) return;
  await recordClientPayAlert({
    customerId: input.customerId,
    summary: disputeSepaAlert({
      amountLabel: formatMoney(eurosFromCents(input.amountCents), input.currency || "EUR"),
      paymentIntentId: input.paymentIntentId,
      kind: input.kind,
    }),
  });
}

/** Réservations SEPA déjà écrites dans crm_transactions. Aucun appel Stripe, aucune annulation. */
export async function loadCustomerSepaState(customer: { id: string; stripe_customer_id?: string | null }) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  let admin: SepaAdmin;
  try {
    admin = createServiceClient();
  } catch {
    return { holds: [], failures: [] };
  }
  const [{ data }, { data: companies }] = await Promise.all([
    admin
      .from("crm_transactions")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("source", "stripe")
      .eq("direction", "credit")
      .in("status", ["pending", "void"]),
    admin.from("crm_billing_companies").select("id, company_name").eq("customer_id", customer.id),
  ]);
  const rows = ((data || []) as { external_id?: string | null }[]).filter((row) => !isSepaLockId(row.external_id));
  const names = new Map(
    ((companies || []) as { id: string; company_name: string | null }[]).map((company) => [company.id, company.company_name])
  );
  const holds = sepaHoldsFromRows(rows, names);
  const failures = sepaFailuresFromRows(rows).filter(
    (failure) => !holds.some((hold) => hold.payer === failure.payer && (hold.companyId || "") === (failure.companyId || ""))
  );
  return { holds, failures };
}

export async function alertMandateRevoked(admin: SepaAdmin, paymentMethodId: string) {
  if (!paymentMethodId) return;
  const { data } = await admin
    .from("crm_payment_methods")
    .select("customer_id, last4")
    .eq("stripe_payment_method_id", paymentMethodId)
    .maybeSingle();
  if (!data?.customer_id) return;
  await recordClientPayAlert({
    customerId: data.customer_id,
    summary: mandateRevokedAlert(sepaLast4(data.last4)),
  });
}
