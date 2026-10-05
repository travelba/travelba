import assert from "node:assert/strict";
import test from "node:test";
import { redactIngestText } from "./ingest-redact";
import { looksLikePan, luhnValid, networkPanDigits, redactPans } from "./pan";

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

test("réseau connu : préfixe et longueur réelle, pas seulement Luhn", () => {
  assert.equal(networkPanDigits("4111111111111111"), true);
  assert.equal(networkPanDigits("4111111111111111110"), true);
  assert.equal(networkPanDigits("371449635398431"), true);
  assert.equal(networkPanDigits("378282246310005"), true);
  assert.equal(networkPanDigits("5555555555554444"), true);
  assert.equal(networkPanDigits("2221000000000009"), true);
  assert.equal(networkPanDigits("6011111111111117"), true);
  assert.equal(networkPanDigits("3530111333300000"), true);
  // Luhn juste mais hors réseau : n° de voyage Expedia, billet électronique, suite quelconque.
  assert.equal(networkPanDigits("72849302817369"), false);
  assert.equal(networkPanDigits("05712345678903"), false);
  assert.equal(networkPanDigits("0571234567899"), false);
  assert.equal(networkPanDigits("9876543210987658"), false);
  // Amex à 16 chiffres : longueur fausse.
  assert.equal(networkPanDigits("3782822463100052"), false);
  assert.equal(networkPanDigits("1234567890123456"), false);
});

test("un PAN séparé doit l’être en groupes réguliers", () => {
  assert.equal(looksLikePan("4111111111111111"), true);
  assert.equal(looksLikePan("3782 822463 10005"), true);
  assert.equal(looksLikePan("4111-1111-1111-1111"), true);
  assert.equal(looksLikePan("4111111111 111111"), false);
  assert.equal(looksLikePan("72849302817369"), false);
  assert.equal(looksLikePan("1234567890123456"), false);
});

test("redactPans masque les cartes d’un réseau connu, garde billets, dossiers et nombres quelconques", () => {
  assert.equal(redactPans("4111 1111 1111 1111"), "[carte]");
  assert.equal(redactPans("371449635398431"), "[carte]");
  assert.equal(redactPans("4111111111111111"), "[carte]");
  assert.equal(redactPans("Amex 3782 822463 10005 débitée"), "Amex [carte] débitée");
  assert.equal(redactPans("Carte 4242.4242.4242.4242"), "Carte [carte]");
  assert.equal(redactPans("Billet 05712345678903"), "Billet 05712345678903");
  assert.equal(redactPans("72849302817369"), "72849302817369");
  assert.equal(redactPans("E-ticket 0571234567899"), "E-ticket 0571234567899");
  assert.equal(redactPans("Dossier 1234567890123456 confirmé"), "Dossier 1234567890123456 confirmé");
  assert.equal(redactPans("Réf 9876543210987658"), "Réf 9876543210987658");
  assert.equal(redactPans("Vol AF 1234 le 2026-10-04 à 10h30"), "Vol AF 1234 le 2026-10-04 à 10h30");
  assert.equal(redactPans("Tél +33 7 56 84 13 15"), "Tél +33 7 56 84 13 15");
});

test("le contexte décide : « Confirmation » protège, « carte » masque même hors réseau", () => {
  assert.equal(redactPans("Confirmation 4111111111111111"), "Confirmation 4111111111111111");
  assert.equal(redactPans("Itinéraire n° 4111111111111111"), "Itinéraire n° 4111111111111111");
  assert.equal(redactPans("Booking 4111111111111111 / PNR ABC123"), "Booking 4111111111111111 / PNR ABC123");
  assert.equal(redactPans("Confirmation réglée par carte 4111111111111111"), "Confirmation réglée par carte [carte]");
  assert.equal(redactPans("CB 9876543210987658"), "CB [carte]");
  assert.equal(redactPans("Garantie Visa : 9876 5432 1098 7658"), "Garantie Visa : [carte]");
  // Au-delà de 40 caractères, le mot ne compte plus.
  const far = `Confirmation ${"x".repeat(45)} 4111111111111111`;
  assert.equal(redactPans(far), `Confirmation ${"x".repeat(45)} [carte]`);
});

test("redactIngestText masque aussi les PAN de 13 à 19 chiffres, avec ou sans séparateurs", () => {
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
  assert.equal(
    redactIngestText("Expedia TAAP — Numéro de voyage 72849302817369"),
    "Expedia TAAP — Numéro de voyage 72849302817369"
  );
  assert.equal(redactIngestText("Billet électronique 05712345678903"), "Billet électronique 05712345678903");
});
