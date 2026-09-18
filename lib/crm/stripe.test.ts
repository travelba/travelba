import assert from "node:assert/strict";
import test from "node:test";
import { isLiveStripePublishable, isLiveStripeSecret, stripeWebhookConfigured } from "./stripe";

test("live Stripe secrets only", () => {
  assert.equal(isLiveStripeSecret("sk_live_abc"), true);
  assert.equal(isLiveStripeSecret("rk_live_abc"), true);
  assert.equal(isLiveStripeSecret("sk_test_abc"), false);
  assert.equal(isLiveStripeSecret("pk_live_abc"), false);
});

test("live Stripe publishable keys only", () => {
  assert.equal(isLiveStripePublishable("pk_live_abc"), true);
  assert.equal(isLiveStripePublishable("pk_test_abc"), false);
  assert.equal(isLiveStripePublishable("sk_live_abc"), false);
});

test("webhook secret presence only — never log the value", () => {
  const prev = process.env.STRIPE_WEBHOOK_SECRET;
  try {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal(stripeWebhookConfigured(), false);
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
    assert.equal(stripeWebhookConfigured(), true);
  } finally {
    if (prev === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = prev;
  }
});
