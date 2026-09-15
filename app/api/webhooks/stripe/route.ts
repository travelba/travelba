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
