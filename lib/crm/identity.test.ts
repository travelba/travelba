import assert from "node:assert/strict";
import test from "node:test";
import {
  completeGivenNames,
  givenNameTokens,
  greetingGivenName,
  humanizeMrzName,
  normalizeGivenNames,
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
    completeGivenNames("Lyelle Jeanne Arlette", "Arlette Jeanne Lyelle"),
    "Lyelle Jeanne Arlette"
  );
  assert.equal(
    completeGivenNames("Lyelle Jeanne Arlette", "ארלט ז'אן ליאל Arlette Jeanne Lyelle"),
    "Lyelle Jeanne Arlette"
  );
  assert.equal(completeGivenNames("Lyelle Jeanne Arlette", "ליאל ז'אן ארלט"), "Lyelle Jeanne Arlette");
  assert.deepEqual(givenNameTokens("ליאל Lyelle Jeanne"), ["Lyelle", "Jeanne"]);
  assert.deepEqual(givenNameTokens("OLGA EVE GGG"), ["Olga", "Eve"]);
  assert.equal(completeGivenNames("Orene Wilhem Benjamin", "Orène"), "Orène Wilhem Benjamin");
  assert.equal(completeGivenNames("Orene Wilhem Benjamin", "Orèn"), "Orène Wilhem Benjamin");
  assert.equal(
    completeGivenNames("Orene Wilhem Benjamin", "Benjamin, Wilhem, Orène"),
    "Orène Wilhem Benjamin"
  );
  assert.equal(completeGivenNames("Benolt", "Benoit"), "Benoit");
  assert.equal(completeGivenNames("Benolt", "Nationalité Benoit"), "Benoit");
  assert.equal(completeGivenNames("Wilhem", "Wilhe"), "Wilhem");
  assert.equal(completeGivenNames("Orene", "Orenec"), "Orene");
});

test("l’accueil ne garde que le premier prénom", () => {
  assert.equal(greetingGivenName("Simon, Iony"), "Simon");
  assert.equal(greetingGivenName("Jérémy Moïse"), "Jérémy");
  assert.equal(greetingGivenName("JEAN-PIERRE Marie"), "Jean-Pierre");
  assert.equal(greetingGivenName("  "), null);
  assert.equal(greetingGivenName(null), null);
});
