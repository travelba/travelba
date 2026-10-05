import assert from "node:assert/strict";
import test from "node:test";
import { fold, foldLetters } from "./text";
import { resolveCountryCode } from "./countries";

test("fold retire accents et majuscules, garde espaces et ponctuation", () => {
  assert.equal(fold("Élodie-Zoé  DUPONT"), "elodie-zoe  dupont");
  assert.equal(fold("Côte d’Ivoire"), "cote d’ivoire");
  assert.equal(fold(null), "");
  assert.equal(fold(undefined), "");
});

test("foldLetters ne garde que a-z : même clé pour les graphies d’un nom", () => {
  assert.equal(foldLetters("Élodie-Zoé DUPONT"), "elodiezoedupont");
  assert.equal(foldLetters("Ben Youssef"), foldLetters("BEN-YOUSSEF"));
  assert.equal(foldLetters("  "), "");
  assert.equal(foldLetters("1234"), "");
});

test("les pays se retrouvent malgré accents et casse", () => {
  assert.equal(resolveCountryCode("Émirats arabes unis"), "AE");
  assert.equal(resolveCountryCode("EMIRATS ARABES UNIS"), "AE");
  assert.equal(resolveCountryCode("côte d’ivoire"), "CI");
});
