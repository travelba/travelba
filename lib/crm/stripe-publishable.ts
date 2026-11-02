/** Clé publique Stripe, sans le SDK Node. Importable depuis un composant client. */

export function isLiveStripePublishable(key: string) {
  return key.startsWith("pk_live_");
}

export function productionStripeOnly() {
  return process.env.VERCEL_ENV === "production";
}

export function stripePublishableKey() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
  if (!key) return null;
  if (productionStripeOnly() && !isLiveStripePublishable(key)) return null;
  return key;
}
