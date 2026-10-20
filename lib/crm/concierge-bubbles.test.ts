import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { conciergeOpening, conciergeSkillVersion, packBubbles } from "../concierge/bubbles";

test("la skill du concierge est en version 1 et montre vingt échanges", () => {
  assert.equal(conciergeSkillVersion(), "1");
  const examples = readFileSync(join(process.cwd(), "lib/concierge/skill/examples.md"), "utf8");
  const clients = examples.match(/^Client :/gm) || [];
  assert.ok(clients.length >= 20, String(clients.length));
});

test("une ouverture salue en minuscule et ne signe que la première bulle", () => {
  const messages = packBubbles({
    text: "Votre vol AF2100 pour Marrakech décolle jeudi à 9h15.\nLe transfert vers l'hôtel sera confirmé par l'équipe.",
    opening: true,
    firstName: "Camille",
    lang: "fr",
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0], /^Bonjour Camille, votre vol/);
  assert.match(messages[0], /\n\nLe Concierge$/);
  assert.equal(messages[1].includes("Le Concierge"), false);
  assert.equal(/^Bonjour/.test(messages[1]), false);
});

test("un fil du jour ne resalue pas", () => {
  const now = new Date("2026-10-20T11:20:00Z");
  assert.equal(conciergeOpening([{ direction: "outbound", at: now.toISOString() }], now), false);
  assert.equal(conciergeOpening([{ direction: "outbound", at: "2026-10-19T11:20:00Z" }], now), true);
  const messages = packBubbles({
    text: "Vous séjournez à La Mamounia du 22 au 29 octobre.",
    opening: false,
    firstName: "Camille",
    lang: "fr",
  });
  assert.deepEqual(messages, ["Vous séjournez à La Mamounia du 22 au 29 octobre."]);
});
