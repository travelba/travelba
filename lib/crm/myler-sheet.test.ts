import assert from "node:assert/strict";
import test from "node:test";
import { MYLER_PARTNER, MYLER_SHEET, mylerRefreshNotice, partnerVisibleProbeError } from "./myler-sheet";

test("la fiche agence parle du compte de production, sans bac à sable", () => {
  assert.equal(MYLER_SHEET.host, "Compte de production");
  assert.equal(MYLER_SHEET.keyOff, "Clé absente. La lecture n’est pas branchée.");
  assert.match(MYLER_SHEET.keyNote, /compte de production/);
  assert.match(MYLER_SHEET.blocked, /n’est pas branchée/);
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
  assert.equal(text.includes("api-staging"), false);
  assert.equal(text.includes("LITTLE_EMPERORS_API_KEY"), false);
  assert.equal(text.includes("sk_"), false);
});

test("la fiche partenaire est en anglais et ne dit pas que le SSO est utilisé", () => {
  const text = JSON.stringify(MYLER_PARTNER);
  assert.equal(MYLER_PARTNER.keyOn, "Test key: present.");
  assert.equal(MYLER_PARTNER.refresh, "Refresh");
  assert.match(MYLER_PARTNER.sso, /is not used for MyLER/);
  assert.match(MYLER_PARTNER.sso, /\/v1\/login/);
  assert.equal(mylerRefreshNotice(0, true), MYLER_PARTNER.refreshEmpty);
  assert.match(mylerRefreshNotice(2, true), /2 reservations/);
  assert.equal(/[àâäéèêëïîôùûüçœ]/i.test(text), false);
  assert.equal(text.includes("LITTLE_EMPERORS"), false);
  assert.match(partnerVisibleProbeError("La clé est absente."), /Use Refresh/);
  assert.match(partnerVisibleProbeError("bookings() on null"), /has not attached/);
});
