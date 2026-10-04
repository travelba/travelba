import assert from "node:assert/strict";
import test from "node:test";
import { redactIngestText } from "./ingest-redact";
import { looksLikePan, luhnValid, redactPans } from "./pan";

test("Luhn : Visa, Amex, Mastercard, Discover, JCB passent ; longueur et clé fausses non", () => {
  assert.equal(luhnValid("4111111111111111"), true);
  assert.equal(luhnValid("378282246310005"), true);
  assert.equal(luhnValid("5555555555554444"), true);
  assert.equal(luhnValid("6011111111111117"), true);
  assert.equal(luhnValid("3530111333300000"), true);
  assert.equal(luhnValid("1234567890123456"), false);
  assert.equal(luhnValid("4111111111111112"), false);
  assert.equal(luhnValid("411111111111"), false);
  assert.equal(luhnValid("41111111111111111111"), false);
  assert.equal(luhnValid("4111 1111 1111 1111"), false);
  assert.equal(luhnValid(""), false);
});

test("un PAN séparé doit l’être en groupes réguliers", () => {
  assert.equal(looksLikePan("4111111111111111"), true);
  assert.equal(looksLikePan("3782 822463 10005"), true);
  assert.equal(looksLikePan("4111-1111-1111-1111"), true);
  assert.equal(looksLikePan("4111111111 111111"), false);
  assert.equal(looksLikePan("1234567890123456"), false);
});

test("redactPans masque Amex 4-6-5 et Visa collée, garde un numéro de dossier non Luhn", () => {
  assert.equal(redactPans("Amex 3782 822463 10005 débitée"), "Amex [carte] débitée");
  assert.equal(redactPans("Visa 4111111111111111 débitée"), "Visa [carte] débitée");
  assert.equal(redactPans("Carte 4242.4242.4242.4242"), "Carte [carte]");
  assert.equal(redactPans("Dossier 1234567890123456 confirmé"), "Dossier 1234567890123456 confirmé");
  assert.equal(redactPans("Réf 2026100412345678"), "Réf 2026100412345678");
  assert.equal(redactPans("Vol AF 1234 le 2026-10-04 à 10h30"), "Vol AF 1234 le 2026-10-04 à 10h30");
  assert.equal(redactPans("Tél +33 7 56 84 13 15"), "Tél +33 7 56 84 13 15");
});

test("redactIngestText masque aussi les PAN Luhn de 13 à 19 chiffres, avec ou sans séparateurs", () => {
  const amex = redactIngestText("Règlement Amex 3782 822463 10005, solde à l’arrivée.");
  assert.equal(amex.includes("10005"), false);
  assert.match(amex, /\[carte\]/);
  const visa = redactIngestText("Garantie carte 4111111111111111 (Visa)");
  assert.equal(visa.includes("4111111111111111"), false);
  assert.match(visa, /\[carte\]/);
  const grouped = redactIngestText("Visa 4111 1111 1111 1111");
  assert.equal(grouped.includes("1111"), false);
  assert.equal(
    redactIngestText("Numéro de dossier 1234567890123456 — PNR ABC123"),
    "Numéro de dossier 1234567890123456 — PNR ABC123"
  );
});
