import { NextResponse } from "next/server";
import { getStripe } from "@/lib/crm/stripe";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Webhook Stripe non configuré" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature manquante" }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const payment = event.data.object;
    const scheduleId = payment.metadata.crm_schedule_id;
    if (scheduleId && payment.amount_received > 0) {
      const supabase = createServiceClient();
      const { error } = await supabase.rpc("crm_record_schedule_payment", {
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
  return NextResponse.json({ received: true });
}
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

  if (event.type === "payment_method.detached") {
    const pm = event.data.object as Stripe.PaymentMethod;
    await admin
      .from("crm_payment_methods")
      .delete()
      .eq("stripe_payment_method_id", pm.id);
  }

  return NextResponse.json({ received: true });
}
