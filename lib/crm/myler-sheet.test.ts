import assert from "node:assert/strict";
import test from "node:test";
import { MYLER_PARTNER, MYLER_SHEET, mylerRefreshNotice, partnerVisibleProbeError } from "./myler-sheet";

test("la fiche agence parle du compte de production, sans bac à sable", () => {
  assert.equal(MYLER_SHEET.host, "Compte de production");
  assert.equal(MYLER_SHEET.keyOff, "Clé de production : absente sur cet environnement.");
  assert.match(MYLER_SHEET.keyPending, /appelle l’API de production/);
  assert.match(MYLER_SHEET.keyNote, /compte de production/);
  assert.match(MYLER_SHEET.keyNote, /La production appelle l’API de production/);
  assert.match(MYLER_SHEET.blocked, /appelle l’API de production/);
  assert.match(MYLER_SHEET.intro.join(" "), /back-office interne/);
  assert.match(MYLER_SHEET.intro.join(" "), /24 septembre/);
  assert.match(MYLER_SHEET.sync, /liste vide est une réponse réussie/);
  assert.equal(MYLER_SHEET.webhook, "https://travelba.fr/api/webhooks/little-emperors");
  assert.equal(
    mylerRefreshNotice(0),
    "Lecture réussie. Aucune réservation à afficher."
  );
  assert.match(mylerRefreshNotice(2), /compte de production/);
  assert.match(mylerRefreshNotice(2), /2 réservations/);
  const text = JSON.stringify(MYLER_SHEET);
  assert.equal(text.includes("environnement de test"), false);
  assert.equal(text.includes("n’appelle pas cette API"), false);
  assert.equal(text.includes("n’appelle pas"), false);
  assert.equal(text.includes("Clé de test : absente"), false);
  assert.equal(text.includes("api-staging"), false);
  assert.equal(text.includes("appellera"), false);
  assert.equal(text.includes("LITTLE_EMPERORS_API_KEY"), false);
  assert.equal(text.includes("sk_"), false);
});

test("la fiche partenaire est en anglais et ne dit pas que le SSO est utilisé", () => {
  const text = JSON.stringify(MYLER_PARTNER);
  assert.equal(MYLER_PARTNER.keyOn, "Test key: present.");
  assert.match(MYLER_PARTNER.keyNote, /calls the Little Emperors staging API with the test key/);
  assert.match(MYLER_PARTNER.keyNote, /Production calls the Little Emperors production API/);
  assert.equal(text.includes("once that key is issued"), false);
  assert.match(MYLER_PARTNER.intro.join(" "), /internal back office/);
  assert.match(MYLER_PARTNER.intro.join(" "), /24 September/);
  assert.match(MYLER_PARTNER.intro.join(" "), /match them to Travel BA clients/);
  assert.equal(MYLER_PARTNER.refresh, "Refresh");
  assert.match(MYLER_PARTNER.sso, /is not used for MyLER/);
  assert.match(MYLER_PARTNER.sso, /\/v1\/login/);
  assert.equal(mylerRefreshNotice(0, true), MYLER_PARTNER.refreshEmpty);
  assert.match(mylerRefreshNotice(2, true), /2 reservations/);
  assert.equal(/[àâäéèêëïîôùûüçœ]/i.test(text), false);
  assert.equal(text.includes("LITTLE_EMPERORS"), false);
  assert.equal(/does not call/i.test(text), false);
  assert.equal(text.includes("not the Little Emperors production key"), false);
  assert.equal(text.includes("Test key: absent"), false);
  assert.match(partnerVisibleProbeError("La clé est absente."), /Use Refresh/);
  assert.match(partnerVisibleProbeError("bookings() on null"), /has not attached/);
});
