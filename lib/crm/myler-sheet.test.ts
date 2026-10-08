import assert from "node:assert/strict";
import test from "node:test";
import { MYLER_SHEET, mylerRefreshNotice } from "./myler-sheet";

test("la fiche MyLER nomme la clé, les routes v2 et le webhook, pas un secret", () => {
  assert.equal(MYLER_SHEET.host, "api-staging.littleemperors.com");
  assert.equal(MYLER_SHEET.keyOn, "Clé de test : présente.");
  assert.equal(MYLER_SHEET.keyOff, "Clé de test : absente.");
  assert.match(MYLER_SHEET.auth, /Authorization: Bearer/);
  assert.match(MYLER_SHEET.sso, /\/v1\/login/);
  assert.match(MYLER_SHEET.sso, /n’est pas utilisé pour MyLER/);
  assert.match(MYLER_SHEET.sso, /compte Travelba/);
  assert.match(MYLER_SHEET.sync, /GET \/v2\/hotels\/bookings/);
  assert.match(MYLER_SHEET.sync, /liste vide est une réponse réussie/);
  assert.deepEqual(MYLER_SHEET.routes, [
    "GET /v2/hotels/bookings",
    "GET /v2/hotels/{id}",
    "DELETE /v2/hotels/bookings/{id}",
  ]);
  assert.equal(MYLER_SHEET.webhook, "https://travelba.fr/api/webhooks/little-emperors");
  assert.equal(MYLER_SHEET.webhookHeader, "X-Access-Key");
  assert.match(MYLER_SHEET.webhookOff, /absent/);
  assert.match(MYLER_SHEET.webhookOn, /n’est pas affichée/);
  assert.equal(
    mylerRefreshNotice(0),
    "L’environnement de test a répondu. Aucune réservation : c’est normal, le staging n’en a pas encore."
  );
  assert.match(mylerRefreshNotice(2), /2 réservations/);
  const text = JSON.stringify(MYLER_SHEET);
  assert.equal(text.includes("LITTLE_EMPERORS_API_KEY"), false);
  assert.equal(text.includes("LITTLE_EMPERORS_WEBHOOK_KEY"), false);
  assert.equal(text.includes("sk_"), false);
});
