import assert from "node:assert/strict";
import test from "node:test";
import {
  ESPACE_BUNDLE_ID,
  ESPACE_DISTRIBUTION,
  ESPACE_PLATFORMS,
  ESPACE_SCHEME,
  appleAppId,
  appleAppSiteAssociation,
  appStoreReviewNotes,
  associatedDomainHost,
  espaceDeepLink,
  espaceSchemeLink,
  espaceStoreListing,
  isEspaceUniversalPath,
  privacyPolicyPath,
  privacyPolicyUrl,
} from "./espace-app";

test("l’app iPhone est unlisted, pas un wrapper public", () => {
  assert.equal(ESPACE_DISTRIBUTION, "unlisted");
  assert.deepEqual(ESPACE_PLATFORMS, ["iphone"]);
  assert.equal(ESPACE_BUNDLE_ID, "fr.travelba.espace");
  assert.equal(ESPACE_SCHEME, "travelba");
});

test("l’App ID Apple assemble team + bundle", () => {
  assert.equal(appleAppId(""), "");
  assert.equal(appleAppId("AB12CD34EF"), "AB12CD34EF.fr.travelba.espace");
});

test("AASA n’invente pas de team id", () => {
  const empty = appleAppSiteAssociation("");
  assert.deepEqual(empty.applinks.details, []);
  assert.deepEqual(empty.webcredentials.apps, []);

  const ready = appleAppSiteAssociation("AB12CD34EF");
  assert.equal(ready.applinks.details[0]?.appID, "AB12CD34EF.fr.travelba.espace");
  assert.ok(ready.applinks.details[0]?.paths.includes("/e/*"));
  assert.ok(ready.applinks.details[0]?.paths.includes("/mon-compte/*"));
  assert.ok(ready.applinks.details[0]?.paths.includes("/auth/callback"));
});

test("les liens invitation et espace ouvrent l’app", () => {
  assert.equal(isEspaceUniversalPath("/e/AB23CD45"), true);
  assert.equal(isEspaceUniversalPath("/e/c/AB23CD45"), true);
  assert.equal(isEspaceUniversalPath("/auth/callback?code=x"), true);
  assert.equal(isEspaceUniversalPath("/mon-compte/reservations/TB-1"), true);
  assert.equal(isEspaceUniversalPath("/connexion/mot-de-passe"), true);
  assert.equal(isEspaceUniversalPath("/admin"), false);
  assert.equal(isEspaceUniversalPath("/fr"), false);
});

test("la politique de confidentialité est une URL publique", () => {
  assert.equal(privacyPolicyPath("fr"), "/fr/confidentialite");
  assert.equal(privacyPolicyUrl("https://travelba.fr"), "https://travelba.fr/fr/confidentialite");
  assert.equal(associatedDomainHost("https://travelba.fr"), "travelba.fr");
});

test("la fiche App Store reste en français, sans IAP", () => {
  const listing = espaceStoreListing();
  assert.equal(listing.privacyUrl, "https://travelba.fr/fr/confidentialite");
  assert.match(listing.description, /carnet/i);
  assert.equal(listing.primaryLocale, "fr-FR");
  assert.match(appStoreReviewNotes(), /invités/);
  assert.match(appStoreReviewNotes(), /Pas d’encaissement carte/);
});

test("liens universels et scheme restent stables", () => {
  assert.equal(espaceDeepLink("/e/ABC"), "https://travelba.fr/e/ABC");
  assert.equal(espaceSchemeLink("/mon-compte"), "travelba://mon-compte");
});
