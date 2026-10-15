import assert from "node:assert/strict";
import test from "node:test";
import { MYLER_PARTNER, MYLER_SHEET, mylerRefreshNotice, partnerVisibleProbeError } from "./myler-sheet";

test("la fiche MyLER nomme la clé, les routes v2 et le webhook, pas un secret", () => {
  assert.equal(MYLER_SHEET.host, "api-staging.littleemperors.com");
  assert.equal(MYLER_SHEET.keyOn, "Clé de test : présente.");
  assert.match(MYLER_SHEET.keyOff, /appelle l’API de staging/);
  assert.match(MYLER_SHEET.intro.join(" "), /back-office interne/);
  assert.match(MYLER_SHEET.intro.join(" "), /24 septembre/);
  assert.match(MYLER_SHEET.intro.join(" "), /GET \/v2\/hotels\/bookings/);
  assert.match(MYLER_SHEET.intro.join(" "), /X-Access-Key/);
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
    "L’API de staging a répondu. Aucune réservation : c’est normal, le staging n’en a pas encore."
  );
  assert.match(mylerRefreshNotice(2), /2 réservations/);
  const text = JSON.stringify(MYLER_SHEET);
  assert.equal(text.includes("LITTLE_EMPERORS_API_KEY"), false);
  assert.equal(text.includes("LITTLE_EMPERORS_WEBHOOK_KEY"), false);
  assert.equal(text.includes("sk_"), false);
  assert.equal(text.includes("Clé de test : absente"), false);
  assert.equal(text.includes("n’appelle pas"), false);
  assert.equal(text.includes("n'appelle pas"), false);
});

test("la fiche partenaire est en anglais et ne dit pas que le SSO est utilisé", () => {
  const text = JSON.stringify(MYLER_PARTNER);
  assert.equal(MYLER_PARTNER.keyOn, "Test key: present.");
  assert.match(MYLER_PARTNER.keyNote, /calls the Little Emperors staging API with the test key/);
  assert.match(MYLER_PARTNER.keyNote, /production API once that key is issued/);
  assert.match(MYLER_PARTNER.intro.join(" "), /internal back office/);
  assert.match(MYLER_PARTNER.intro.join(" "), /not a public website/);
  assert.match(MYLER_PARTNER.intro.join(" "), /24 September/);
  assert.match(MYLER_PARTNER.intro.join(" "), /match them to Travel BA clients/);
  assert.match(MYLER_PARTNER.intro.join(" "), /view or cancel/);
  assert.match(MYLER_PARTNER.intro.join(" "), /GET \/v2\/hotels\/bookings/);
  assert.match(MYLER_PARTNER.intro.join(" "), /DELETE \/v2\/hotels\/bookings\/\{id\}/);
  assert.match(MYLER_PARTNER.intro.join(" "), /Webhook:/);
  assert.match(MYLER_PARTNER.intro.join(" "), /X-Access-Key/);
  assert.equal(MYLER_PARTNER.refresh, "Refresh");
  assert.match(MYLER_PARTNER.sso, /is not used for MyLER/);
  assert.match(MYLER_PARTNER.sso, /\/v1\/login/);
  assert.equal(mylerRefreshNotice(0, true), MYLER_PARTNER.refreshEmpty);
  assert.match(mylerRefreshNotice(2, true), /2 reservations/);
  assert.equal(/[àâäéèêëïîôùûüçœ]/i.test(text), false);
  assert.equal(text.includes("LITTLE_EMPERORS"), false);
  assert.equal(/does not call/i.test(text), false);
  assert.equal(/do not call/i.test(text), false);
  assert.equal(text.includes("not the Little Emperors production key"), false);
  assert.match(partnerVisibleProbeError("La clé est absente."), /Use Refresh/);
  assert.match(partnerVisibleProbeError("bookings() on null"), /has not attached/);
});
