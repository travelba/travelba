import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { getStripe, stripeConfigured } from "@/lib/crm/stripe";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!stripeConfigured()) {
    return jsonError("Stripe n’est pas configuré", 503);
  }
  const stripe = getStripe()!;
  const admin = createServiceClient();
  let customerId = auth.customer.stripe_customer_id;
  if (!customerId) {
    const created = await stripe.customers.create({
      email: auth.customer.email,
      name: [auth.customer.first_name, auth.customer.last_name]
        .filter(Boolean)
        .join(" "),
      metadata: { crm_customer_id: auth.customer.id },
    });
    customerId = created.id;
    await admin
      .from("crm_customers")
      .update({ stripe_customer_id: customerId })
      .eq("id", auth.customer.id);
  }
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    payment_method_types: ["card"],
    metadata: { crm_customer_id: auth.customer.id },
  });
  return NextResponse.json({ clientSecret: intent.client_secret });
}
