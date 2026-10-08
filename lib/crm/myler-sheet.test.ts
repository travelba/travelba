import assert from "node:assert/strict";
import test from "node:test";
import { MYLER_SHEET } from "./myler-sheet";

test("la fiche MyLER nomme la clé, les routes v2 et le webhook, pas un secret", () => {
  assert.equal(MYLER_SHEET.host, "api-staging.littleemperors.com");
  assert.match(MYLER_SHEET.auth, /Authorization: Bearer/);
  assert.match(MYLER_SHEET.sso, /\/v1\/login/);
  assert.match(MYLER_SHEET.sso, /n’est pas utilisé pour MyLER/);
  assert.deepEqual(MYLER_SHEET.routes, [
    "GET /v2/hotels/bookings",
    "GET /v2/hotels/{id}",
    "DELETE /v2/hotels/bookings/{id}",
  ]);
  assert.equal(MYLER_SHEET.webhook, "https://travelba.fr/api/webhooks/little-emperors");
  assert.equal(MYLER_SHEET.webhookHeader, "X-Access-Key");
  const text = JSON.stringify(MYLER_SHEET);
  assert.equal(text.includes("LITTLE_EMPERORS_API_KEY"), false);
  assert.equal(text.includes("sk_"), false);
});
