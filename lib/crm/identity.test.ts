import assert from "node:assert/strict";
import test from "node:test";
import {
  ageAndSexCaption,
  ageLabel,
  ageYears,
  birthCaption,
  completeGivenNames,
  givenNameTokens,
  greetingGivenName,
  shownPersonName,
  humanizeMrzName,
  maskDocumentNumber,
  normalizeGivenNames,
  allCapsNameNote,
  PASSPORT_VAULT_NOTICE,
  recordedNameIsAllCaps,
  sexLabel,
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
  assert.equal(shownPersonName({ first_name: "Maelle Louise Rosalie", last_name: "Dupont" }), "Maelle Dupont");
  assert.equal(shownPersonName({ first_name: "JEAN-PIERRE Marie", last_name: "Martin" }), "Jean-Pierre Martin");
});

test("à côté de la naissance : l’âge du jour et le sexe", () => {
  const today = "2026-10-12";
  assert.equal(ageYears("1985-10-12", today), 41);
  assert.equal(ageYears("1985-10-13", today), 40);
  assert.equal(ageYears("2025-10-12", today), 1);
  assert.equal(ageYears("2025-10-13", today), 0);
  assert.equal(ageYears("2026-10-12", today), 0);
  assert.equal(ageYears("2026-10-13", today), null);
  assert.equal(ageYears("1890-01-01", today), null);
  assert.equal(ageYears("2012-02-29", "2026-02-28"), 13);
  assert.equal(ageYears("pas une date", today), null);
  assert.equal(ageLabel("1985-10-12", today), "41 ans");
  assert.equal(ageLabel("2025-10-12", today), "1 an");
  assert.equal(ageLabel("2026-01-01", today), "moins d’un an");
  assert.equal(sexLabel("F"), "Femme");
  assert.equal(sexLabel("M"), "Homme");
  assert.equal(sexLabel("X"), "Autre");
  assert.equal(sexLabel("Z"), null);
  assert.equal(ageAndSexCaption("1985-10-12", "F", today), "41 ans · Femme");
  assert.equal(ageAndSexCaption("", "M", today), "Homme");
  assert.equal(birthCaption("1985-10-12", "F", today), "12 oct. 1985 · 41 ans · Femme");
  assert.equal(birthCaption("1985-10-12", null, today), "12 oct. 1985 · 41 ans");
  assert.equal(birthCaption(null, "M", today), "Homme");
  assert.equal(birthCaption("", "", today), "");
});

test("un nom tout en capitales se signale sans être réécrit", () => {
  assert.equal(recordedNameIsAllCaps("MARTIN"), true);
  assert.equal(recordedNameIsAllCaps("Martin"), false);
  assert.equal(recordedNameIsAllCaps("Jean-Pierre"), false);
  assert.match(allCapsNameNote("CAMILLE", "Martin") || "", /capitales/);
  assert.equal(allCapsNameNote("Camille", "Martin"), null);
});
