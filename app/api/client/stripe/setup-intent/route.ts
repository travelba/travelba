import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { ensureStripeCustomer, getStripe, stripeConfigured } from "@/lib/crm/stripe";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordCustomerActivity } from "@/lib/crm/customer-activity";

export async function POST() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!stripeConfigured()) {
    return jsonError("Stripe n’est pas configuré", 503);
  }
  const stripe = getStripe()!;
  const admin = createServiceClient();
  const customerId = await ensureStripeCustomer(stripe, admin, auth.customer);
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    payment_method_types: ["card"],
    metadata: { crm_customer_id: auth.customer.id },
  });
  await recordCustomerActivity({
    customerId: auth.customer.id,
    authUserId: auth.user.id,
    action: "card",
    summary: "A commencé à enregistrer une carte",
  });
  return NextResponse.json({ clientSecret: intent.client_secret });
}
