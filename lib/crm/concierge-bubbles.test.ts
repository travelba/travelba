import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { conciergeOpening, packBubbles } from "../concierge/bubbles";
import { buildConciergeDossier, planConciergeTurn } from "./whatsapp-concierge";
import { conciergeSkillVersion } from "../concierge/skill-prompt";
import { CONCIERGE_EXAMPLES_MD, CONCIERGE_SKILL_MD, CONCIERGE_SKILL_VERSION } from "../concierge/skill/text";

test("la skill du concierge est en version 1 et montre vingt échanges", () => {
  assert.equal(conciergeSkillVersion(), "1");
  const skill = readFileSync(join(process.cwd(), "lib/concierge/skill/SKILL.md"), "utf8");
  const examples = readFileSync(join(process.cwd(), "lib/concierge/skill/examples.md"), "utf8");
  assert.equal(CONCIERGE_SKILL_MD, skill);
  assert.equal(CONCIERGE_EXAMPLES_MD, examples);
  assert.equal(CONCIERGE_SKILL_VERSION, skill.match(/^version:\s*(\S+)/m)?.[1] || "");
  const clients = examples.match(/^Client :/gm) || [];
  assert.ok(clients.length >= 20, String(clients.length));
});

test("la signature ferme la dernière bulle et n’en forme jamais une seule", () => {
  const messages = packBubbles({
    text: "Votre vol AF2100 pour Marrakech décolle jeudi à 9h15.\nLe transfert vers l'hôtel sera confirmé par l'équipe.",
    opening: true,
    firstName: "Camille",
    lang: "fr",
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0], /^Bonjour Camille, votre vol/);
  assert.equal(messages[0].includes("Le Concierge"), false);
  assert.match(messages[1], /confirmé par l'équipe\.\nLe Concierge$/);
  assert.equal(messages.some((bubble) => bubble.trim() === "Le Concierge"), false);
  const alone = packBubbles({
    text: "Vous séjournez à La Mamounia du 22 au 29 octobre.",
    opening: true,
    firstName: "Camille",
    lang: "fr",
  });
  assert.equal(alone.length, 1);
  assert.match(alone[0], /octobre\.\nLe Concierge$/);
});

test("l’encours à l’ouverture ne signe pas le lien seul", () => {
  const dossier = buildConciergeDossier({
    firstName: "Benjamin",
    balances: [{ currency: "EUR", balance: -5615 }],
  });
  const turn = planConciergeTurn("Quel est mon encours ?", dossier, new Date("2026-11-23T09:00:00Z"), []);
  const messages = turn.messages || [];
  assert.equal(turn.handoff, null);
  assert.ok(messages.length >= 1);
  for (const bubble of messages) {
    assert.equal(/^https?:\/\/\S+\nLe Concierge$/.test(bubble.trim()), false);
  }
  const withLink = messages.find((bubble) => bubble.includes("/mon-compte/transactions")) || "";
  assert.ok(withLink);
  assert.match(withLink, /régler/);
  assert.match(withLink, /Le Concierge/);
  assert.ok(withLink.length <= 220);
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
