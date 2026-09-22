import Stripe from "stripe";

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
