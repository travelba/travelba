import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export function isLiveStripeSecret(secret: string) {
  return secret.startsWith("sk_live_") || secret.startsWith("rk_live_");
}

export function isLiveStripePublishable(key: string) {
  return key.startsWith("pk_live_");
}

function productionStripeOnly() {
  return process.env.VERCEL_ENV === "production";
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (productionStripeOnly() && !isLiveStripeSecret(key)) {
    console.error("[stripe] clé test refusée en production");
    return null;
  }
  return new Stripe(key);
}

export function stripeConfigured() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!secret || !publishable) return false;
  if (productionStripeOnly()) {
    return isLiveStripeSecret(secret) && isLiveStripePublishable(publishable);
  }
  return true;
}

export function stripeWebhookConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function stripePublishableKey() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
  if (!key) return null;
  if (productionStripeOnly() && !isLiveStripePublishable(key)) return null;
  return key;
}

/** Client Stripe du compte qui règle. Aucun PAN. */
export async function ensureStripeCustomer(
  stripe: Stripe,
  admin: SupabaseClient,
  customer: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    stripe_customer_id: string | null;
  }
) {
  if (customer.stripe_customer_id) return customer.stripe_customer_id;
  const created = await stripe.customers.create({
    email: customer.email,
    name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
    metadata: { crm_customer_id: customer.id },
  });
  await admin.from("crm_customers").update({ stripe_customer_id: created.id }).eq("id", customer.id);
  return created.id;
}
