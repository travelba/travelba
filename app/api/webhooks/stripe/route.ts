import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/crm/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe non configuré" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature manquante" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  const admin = createServiceClient();

  if (event.type === "setup_intent.succeeded") {
    const intent = event.data.object as Stripe.SetupIntent;
    const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
    const stripeCustomerId = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
    if (paymentMethodId && stripeCustomerId) {
      const { data: customer } = await admin.from("crm_customers").select("id").eq("stripe_customer_id", stripeCustomerId).maybeSingle();
      if (customer) {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        const { count } = await admin.from("crm_payment_methods").select("id", { count: "exact", head: true }).eq("customer_id", customer.id);
        const { error } = await admin.from("crm_payment_methods").upsert({
          customer_id: customer.id,
          stripe_payment_method_id: paymentMethodId,
          brand: paymentMethod.card?.brand || null,
          last4: paymentMethod.card?.last4 || null,
          exp_month: paymentMethod.card?.exp_month || null,
          exp_year: paymentMethod.card?.exp_year || null,
          is_default: (count ?? 0) === 0,
        }, { onConflict: "stripe_payment_method_id" });
        if (error) return NextResponse.json({ error: "Enregistrement du moyen de paiement impossible" }, { status: 500 });
      }
    }
  }

  if (event.type === "payment_intent.succeeded") {
    const payment = event.data.object as Stripe.PaymentIntent;
    const scheduleId = payment.metadata.crm_schedule_id;
    if (scheduleId && payment.amount_received > 0) {
      const { data: schedule } = await admin
        .from("crm_payment_schedules")
        .select("customer_id,currency")
        .eq("id", scheduleId)
        .maybeSingle();
      if (
        !schedule ||
        schedule.customer_id !== payment.metadata.crm_customer_id ||
        schedule.currency.toLowerCase() !== payment.currency.toLowerCase()
      ) {
        console.error("Stripe payment metadata mismatch", {
          eventId: event.id,
          paymentIntentId: payment.id,
          scheduleId,
        });
        return NextResponse.json(
          { error: "Métadonnées de paiement incohérentes" },
          { status: 400 }
        );
      }
      const { error } = await admin.rpc("crm_record_schedule_payment", {
        p_schedule_id: scheduleId,
        p_external_id: payment.id,
        p_amount: payment.amount_received / 100,
        p_occurred_on: new Date(payment.created * 1000).toISOString().slice(0, 10),
      });
      if (error) {
        console.error("Stripe payment reconciliation failed", {
          eventId: event.id,
          paymentIntentId: payment.id,
          error: error.message,
        });
        return NextResponse.json({ error: "Rapprochement impossible" }, { status: 500 });
      }
    }
  }

  if (event.type === "refund.created" || event.type === "refund.updated") {
    const refund = event.data.object as Stripe.Refund;
    if (refund.status === "succeeded" && refund.amount > 0) {
      const refundMetadata = refund.metadata || {};
      const paymentIntentId =
        typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id;
      let originalTransactionId = "";
      if (paymentIntentId) {
        const { data: original } = await admin
          .from("crm_transactions")
          .select("id")
          .eq("source", "stripe")
          .eq("external_id", paymentIntentId)
          .eq("direction", "credit")
          .maybeSingle();
        originalTransactionId = original?.id || "";
      }
      const metadataTransactionId = refundMetadata.crm_transaction_id;
      if (
        metadataTransactionId &&
        originalTransactionId &&
        metadataTransactionId !== originalTransactionId
      ) {
        console.error("Stripe refund metadata mismatch", {
          eventId: event.id,
          refundId: refund.id,
          paymentIntentId,
        });
        return NextResponse.json({ error: "Métadonnées de remboursement incohérentes" }, { status: 400 });
      }
      if (!originalTransactionId) {
        const { error: auditError } = await admin.from("crm_audit_events").insert({
          customer_id: refundMetadata.crm_customer_id || null,
          entity_type: "stripe_refund",
          entity_id: refund.id,
          action: metadataTransactionId
            ? "stripe_refund_reconciliation_failed"
            : "stripe_refund_unmatched",
          metadata: {
            payment_intent_id: paymentIntentId,
            metadata_transaction_id: metadataTransactionId || null,
            amount: refund.amount / 100,
          },
        });
        if (auditError) {
          console.error("Stripe unmatched refund audit failed", {
            eventId: event.id,
            refundId: refund.id,
            error: auditError.message,
          });
        }
        return NextResponse.json(
          { error: "Paiement local du remboursement introuvable" },
          { status: 500 }
        );
      }
      if (originalTransactionId) {
        const { error } = await admin.rpc("crm_record_schedule_refund", {
          p_transaction_id: originalTransactionId,
          p_payment_intent_id: paymentIntentId,
          p_external_id: refund.id,
          p_amount: refund.amount / 100,
          p_occurred_on: new Date(refund.created * 1000).toISOString().slice(0, 10),
        });
        if (error) {
          console.error("Stripe refund reconciliation failed", {
            eventId: event.id,
            refundId: refund.id,
            error: error.message,
          });
          return NextResponse.json({ error: "Rapprochement du remboursement impossible" }, { status: 500 });
        }
      }
    }
  }

  if (event.type === "payment_method.detached") {
    const paymentMethod = event.data.object as Stripe.PaymentMethod;
    const { error } = await admin.from("crm_payment_methods").delete().eq("stripe_payment_method_id", paymentMethod.id);
    if (error) return NextResponse.json({ error: "Suppression locale impossible" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
