import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APPLE_PAY_MERCHANT_ID, applePayAssociationBody, applePayTravelAllowed } from "./apple-pay-app";

test("Apple Pay du voyage reste hors achat intégré, marchand fixé", () => {
  assert.equal(applePayTravelAllowed(), true);
  assert.equal(APPLE_PAY_MERCHANT_ID, "merchant.fr.travelba.client");
  assert.equal(applePayAssociationBody(""), null);
  assert.equal(applePayAssociationBody("-----BEGIN PRIVATE KEY-----\nabc"), null);
  assert.equal(applePayAssociationBody("a".repeat(40))?.length, 40);
  const entitlements = readFileSync(new URL("../../mobile/ios/App/App/App.entitlements", import.meta.url), "utf8");
  assert.match(entitlements, /com\.apple\.developer\.in-app-payments/);
  assert.match(entitlements, /merchant\.fr\.travelba\.client/);
  const route = readFileSync(
    new URL("../../app/.well-known/apple-developer-merchantid-domain-association/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(route, /APPLE_PAY_DOMAIN_ASSOCIATION/);
  const pay = readFileSync(new URL("../../components/account/StayPayment.tsx", import.meta.url), "utf8");
  assert.match(pay, /ExpressCheckoutElement/);
  assert.match(pay, /applePay: "always"/);
});
