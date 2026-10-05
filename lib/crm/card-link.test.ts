import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_LINK_CODE_LENGTH,
  CARD_LINK_MAX_OPENS,
  cardLinkCode,
  cardLinkDecision,
  cardLinkExpiresAt,
  cardLinkHash,
  cardLinkNote,
  cardLinkUrl,
  clientCardPurgeDue,
  isCardLinkCode,
  redactCardLinks,
} from "./card-link";

test("card link codes are long, unambiguous and never stored as is", () => {
  const code = cardLinkCode();
  assert.equal(code.length, CARD_LINK_CODE_LENGTH);
  assert.equal(isCardLinkCode(code), true);
  assert.equal(isCardLinkCode("ABCDEFGH234"), false);
  assert.equal(isCardLinkCode("ABCDEFGH2340"), false); // 0 exclu de l’alphabet
  assert.equal(isCardLinkCode("abcdefgh2345"), false);
  assert.match(cardLinkHash(code), /^[0-9a-f]{64}$/);
  assert.equal(cardLinkHash(code).includes(code), false);
  assert.notEqual(cardLinkHash("ABCDEFGH2345"), cardLinkHash("ABCDEFGH2346"));
  assert.equal(cardLinkUrl("https://travelba.fr/", "ABCDEFGH2345"), "https://travelba.fr/k/ABCDEFGH2345");
});

test("a card link lives until the card closes, at least 48 h and at most 45 days", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  assert.equal(cardLinkExpiresAt("2026-10-15", now).toISOString(), "2026-10-15T22:00:00.000Z");
  // Départ déjà passé : 48 h quand même, le temps que l’hôtel encaisse.
  assert.equal(cardLinkExpiresAt("2026-10-04", now).toISOString(), "2026-10-07T10:00:00.000Z");
  assert.equal(cardLinkExpiresAt("2027-06-01", now).toISOString(), "2026-11-19T10:00:00.000Z");
  assert.equal(cardLinkExpiresAt(null, now).toISOString(), "2026-10-07T10:00:00.000Z");
});

test("a card link opens only while alive, unrevoked and under its open count", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  const alive = { now, expiresAt: "2026-10-06T10:00:00Z", revokedAt: null, openCount: 0 };
  assert.equal(cardLinkDecision(alive), "open");
  assert.equal(cardLinkDecision({ ...alive, openCount: CARD_LINK_MAX_OPENS - 1 }), "open");
  assert.equal(cardLinkDecision({ ...alive, openCount: CARD_LINK_MAX_OPENS }), "refuse");
  assert.equal(cardLinkDecision({ ...alive, revokedAt: "2026-10-05T09:00:00Z" }), "refuse");
  assert.equal(cardLinkDecision({ ...alive, expiresAt: "2026-10-05T09:59:59Z" }), "refuse");
  assert.equal(cardLinkDecision({ ...alive, expiresAt: null }), "refuse");
  assert.equal(cardLinkDecision({ ...alive, openCount: 1, maxOpens: 1 }), "refuse");
});

test("the mail note gives the link, never a card number, in the hotel's language", () => {
  const url = "https://travelba.fr/k/ABCDEFGH2345";
  const expiresAt = new Date("2026-10-15T22:00:00Z");
  const fr = cardLinkNote({ choice: "pliant", lang: "fr", url, expiresAt });
  assert.ok(fr.includes(url));
  assert.match(fr, /16\/10\/2026|15\/10\/2026/);
  assert.match(fr, /jamais envoyé par e-mail/);
  assert.equal(/\d{12,}/.test(fr.replace(url, "")), false);
  const en = cardLinkNote({ choice: "client", lang: "en", url, expiresAt });
  assert.match(en, /secure link/);
  assert.match(en, /do not charge the stay to another card/);
});

test("stored copies and quoted replies lose the card link", () => {
  const text = "Merci.\nhttps://travelba.fr/k/ABCDEFGH2345\nhttps://travelba.fr/v/ABCD2345";
  const redacted = redactCardLinks(text);
  assert.equal(redacted.includes("/k/ABCDEFGH2345"), false);
  assert.match(redacted, /\[lien carte sécurisé\]/);
  assert.ok(redacted.includes("/v/ABCD2345"));
});

test("a client card photo is purged once the stay card has closed", () => {
  assert.equal(clientCardPurgeDue("2026-10-04", "2026-10-05"), true);
  assert.equal(clientCardPurgeDue("2026-10-05", "2026-10-05"), false);
  assert.equal(clientCardPurgeDue("2026-10-06", "2026-10-05"), false);
  assert.equal(clientCardPurgeDue(null, "2026-10-05"), false);
  assert.equal(clientCardPurgeDue("bientôt", "2026-10-05"), false);
});
