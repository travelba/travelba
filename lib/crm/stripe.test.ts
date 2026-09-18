import assert from "node:assert/strict";
import test from "node:test";
import { isLiveStripePublishable, isLiveStripeSecret } from "./stripe";

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
