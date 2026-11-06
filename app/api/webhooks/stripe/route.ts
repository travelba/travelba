import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/crm/stripe";
import { stripeCreditFromIntent } from "@/lib/crm/stripe-pay";
import { paymentCreditReleased } from "@/lib/crm/unmatch-credit";
import { autoMatchUnmatchedStripe } from "@/lib/crm/stripe-match";
import { enrichStripeIntents, snapshotFromPaymentIntent, upsertStripeInbox } from "@/lib/crm/stripe-sync";
import { alertMandateRevoked, alertSepaReturned, cancelOrphanSepaIntents, syncSepaIntent, viewFromStripeIntent } from "@/lib/crm/sepa-ledger";
import { readSepaIntent } from "@/lib/crm/sepa-hold";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe non configuré" }, { status: 503 });
  }
  const raw = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const admin = createServiceClient();

  if (event.type === "setup_intent.succeeded") {
    const intent = event.data.object as Stripe.SetupIntent;
    const pmId =
      typeof intent.payment_method === "string"
        ? intent.payment_method
        : intent.payment_method?.id;
    const stripeCustomer =
      typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
    if (!pmId || !stripeCustomer) {
      return NextResponse.json({ ok: true });
    }
    const { data: customer } = await admin
      .from("crm_customers")
      .select("id")
      .eq("stripe_customer_id", stripeCustomer)
      .maybeSingle();
    if (!customer) return NextResponse.json({ ok: true });
    const pm = await stripe.paymentMethods.retrieve(pmId);
    const card = pm.card;
    const { count } = await admin
      .from("crm_payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customer.id);
    await admin.from("crm_payment_methods").upsert(
      {
        customer_id: customer.id,
        stripe_payment_method_id: pmId,
        brand: card?.brand || null,
        last4: card?.last4 || null,
        exp_month: card?.exp_month || null,
        exp_year: card?.exp_year || null,
        is_default: (count ?? 0) === 0,
      },
      { onConflict: "stripe_payment_method_id" }
    );
  }

  if (
    event.type === "payment_intent.processing" ||
    event.type === "payment_intent.payment_failed" ||
    event.type === "payment_intent.canceled"
  ) {
    const intent = event.data.object as Stripe.PaymentIntent;
    const synced = await syncSepaIntent(admin, intent);
    if (!synced.ok) return NextResponse.json({ error: "prélèvement" }, { status: 500 });
    if (event.type === "payment_intent.processing" && readSepaIntent(viewFromStripeIntent(intent)).kind === "flight") {
      const customer = intent.customer;
      const customerId = !customer ? "" : typeof customer === "string" ? customer : customer.id;
      if (customerId) {
        try {
          const listed = await stripe.paymentIntents.list({ customer: customerId, limit: 20 });
          await cancelOrphanSepaIntents(stripe, listed.data);
        } catch (err) {
          console.error("[sepa] formulaire", err instanceof Error ? err.message : "annulation");
        }
      }
    }
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const sepa = readSepaIntent(viewFromStripeIntent(intent)).kind === "succeeded";
    if (sepa) {
      const synced = await syncSepaIntent(admin, intent);
      if (!synced.ok) return NextResponse.json({ error: "prélèvement" }, { status: 500 });
    }
    const credit = sepa
      ? null
      : stripeCreditFromIntent({
          id: intent.id,
          status: intent.status,
          amount: intent.amount,
          currency: intent.currency,
          metadata: intent.metadata,
        });
    if (credit && !(await paymentCreditReleased(admin, "stripe", intent.id))) {
      const { error } = await admin.from("crm_transactions").insert(credit);
      if (error && !/duplicate|unique/i.test(String(error.message || ""))) {
        console.error("[stripe] crédit", error.code || "insert");
        return NextResponse.json({ error: "crédit" }, { status: 500 });
      }
    }
    try {
      const [enriched] = await enrichStripeIntents([intent]);
      await upsertStripeInbox(admin, [enriched || snapshotFromPaymentIntent(intent)]);
      await autoMatchUnmatchedStripe();
    } catch (err) {
      console.error("[stripe] file", err instanceof Error ? err.message : "file");
      return NextResponse.json({ error: "file" }, { status: 500 });
    }
  }

  if (event.type === "payment_method.detached") {
    const pm = event.data.object as Stripe.PaymentMethod;
    await admin
      .from("crm_payment_methods")
      .delete()
      .eq("stripe_payment_method_id", pm.id);
  }

  if (event.type === "charge.pending" || event.type === "charge.succeeded" || event.type === "charge.failed") {
    const charge = event.data.object as Stripe.Charge;
    const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (intentId && charge.payment_method_details?.type === "sepa_debit") {
      try {
        const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
        const reading = readSepaIntent(viewFromStripeIntent(intent));
        if (reading.kind !== "ignore" && reading.kind !== "orphan") {
          const synced = await syncSepaIntent(admin, intent);
          if (!synced.ok) return NextResponse.json({ error: "prélèvement" }, { status: 500 });
        }
      } catch (err) {
        console.error("[sepa] charge", err instanceof Error ? err.message : "lecture");
        return NextResponse.json({ error: "prélèvement" }, { status: 500 });
      }
    }
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const object = event.data.object as Stripe.Charge | Stripe.Dispute;
    const intentId =
      "payment_intent" in object && object.payment_intent
        ? typeof object.payment_intent === "string"
          ? object.payment_intent
          : object.payment_intent.id
        : "";
    if (intentId) {
      try {
        const intent = await stripe.paymentIntents.retrieve(intentId);
        if (intent.metadata?.pay_method === "sepa_debit" && intent.metadata.crm_customer_id) {
          await alertSepaReturned({
            customerId: intent.metadata.crm_customer_id,
            amountCents: intent.amount,
            currency: intent.currency,
            paymentIntentId: intent.id,
            kind: event.type === "charge.dispute.created" ? "dispute" : "refund",
          });
        }
      } catch (err) {
        console.error("[sepa] retour", err instanceof Error ? err.message : "lecture");
      }
    }
  }

  if (event.type === "mandate.updated") {
    const mandate = event.data.object as Stripe.Mandate;
    if (mandate.status === "inactive") {
      const method = mandate.payment_method;
      const methodId = !method ? "" : typeof method === "string" ? method : method.id;
      if (methodId) await alertMandateRevoked(admin, methodId);
    }
  }

  return NextResponse.json({ received: true });
}
