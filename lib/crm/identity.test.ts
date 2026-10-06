import assert from "node:assert/strict";
import test from "node:test";
import {
  completeGivenNames,
  givenNameTokens,
  greetingGivenName,
  humanizeMrzName,
  maskDocumentNumber,
  normalizeGivenNames,
  PASSPORT_VAULT_NOTICE,
} from "./identity";

test("tous les prénoms restent dans l’ordre imprimé", () => {
  assert.deepEqual(givenNameTokens("JEAN PIERRE MARIE"), ["Jean", "Pierre", "Marie"]);
  assert.equal(normalizeGivenNames("JEAN PIERRE MARIE"), "Jean Pierre Marie");
  assert.equal(normalizeGivenNames("BENJAMIN<ADAM<LOUIS"), "Benjamin Adam Louis");
  assert.equal(normalizeGivenNames("Jean-Pierre, Marie"), "Jean-Pierre Marie");
  assert.equal(normalizeGivenNames("  "), null);
});

test("humanizeMrzName sépare les < de la MRZ sans réordonner", () => {
  assert.equal(humanizeMrzName("BENJAMIN<ADAM"), "Benjamin Adam");
  assert.equal(humanizeMrzName("DE<LA<FONTAINE"), "De La Fontaine");
});

test("la liste la plus complète l’emporte si l’ordre est conservé", () => {
  assert.equal(completeGivenNames("Jean", "Jean Pierre Marie"), "Jean Pierre Marie");
  assert.equal(completeGivenNames("Jean Pierre Marie", "Jean"), "Jean Pierre Marie");
  assert.equal(completeGivenNames("Jean Pierre", "Jean Pierre Marie"), "Jean Pierre Marie");
  assert.equal(completeGivenNames("Jean Marie", "Jean Pierre Marie"), "Jean Pierre Marie");
  assert.equal(completeGivenNames("Jean Pierre Marie", "JEAN PIERRE MARIE"), "Jean Pierre Marie");
  assert.equal(completeGivenNames("Jean-Pierre", "Jean-Pierre Marie"), "Jean-Pierre Marie");
  assert.equal(completeGivenNames(null, "Claire Anne"), "Claire Anne");
  assert.equal(completeGivenNames("Claire Anne", null), "Claire Anne");
});

test("l’ordre latin prime, l’hébreu ne retourne pas les prénoms", () => {
  assert.equal(
    completeGivenNames("Maelle Louise Rosalie", "Rosalie Louise Maelle"),
    "Maelle Louise Rosalie"
  );
  assert.equal(
    completeGivenNames("Maelle Louise Rosalie", "רוזלי לואיז מאל Rosalie Louise Maelle"),
    "Maelle Louise Rosalie"
  );
  assert.equal(completeGivenNames("Maelle Louise Rosalie", "מאל לואיז רוזלי"), "Maelle Louise Rosalie");
  assert.deepEqual(givenNameTokens("מאל Maelle Louise"), ["Maelle", "Louise"]);
  assert.deepEqual(givenNameTokens("CLAIRE EVE GGG"), ["Claire", "Eve"]);
  assert.equal(completeGivenNames("Helie Gaspar Augustin", "Hélie"), "Hélie Gaspar Augustin");
  assert.equal(completeGivenNames("Helie Gaspar Augustin", "Héli"), "Hélie Gaspar Augustin");
  assert.equal(
    completeGivenNames("Helie Gaspar Augustin", "Augustin, Gaspar, Hélie"),
    "Hélie Gaspar Augustin"
  );
  assert.equal(completeGivenNames("Benolt", "Benoit"), "Benoit");
  assert.equal(completeGivenNames("Benolt", "Nationalité Benoit"), "Benoit");
  assert.equal(completeGivenNames("Gaspar", "Gaspa"), "Gaspar");
  assert.equal(completeGivenNames("Helie", "Heliec"), "Helie");
});

test("le numéro fermé ne montre que les quatre derniers caractères", () => {
  assert.equal(maskDocumentNumber("12AB34567"), "···· 4567");
  assert.equal(maskDocumentNumber("  12AB34567  "), "···· 4567");
  assert.equal(maskDocumentNumber("AB12"), "····");
  assert.equal(maskDocumentNumber("1"), "····");
  assert.equal(maskDocumentNumber(null), null);
  assert.equal(maskDocumentNumber(""), null);
  assert.equal(maskDocumentNumber("   "), null);
  assert.equal(PASSPORT_VAULT_NOTICE.includes("lien de partage"), true);
  assert.equal(/chiffr|bout en bout|ne quitte jamais|retirer/i.test(PASSPORT_VAULT_NOTICE), false);
});

test("l’accueil ne garde que le premier prénom", () => {
  assert.equal(greetingGivenName("Simon, Iony"), "Simon");
  assert.equal(greetingGivenName("Jérémy Moïse"), "Jérémy");
  assert.equal(greetingGivenName("JEAN-PIERRE Marie"), "Jean-Pierre");
  assert.equal(greetingGivenName("  "), null);
  assert.equal(greetingGivenName(null), null);
});
