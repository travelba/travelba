import assert from "node:assert/strict";
import test from "node:test";
import {
  ENTRY_CODE_LENGTH,
  entryCode,
  entryLinkUrl,
  entryPreviewHtml,
  isLinkCrawler,
  safeNextPath,
  shouldServePreview,
} from "./entry-link";

test("le code tient en huit signes", () => {
  const code = entryCode();
  assert.equal(code.length, ENTRY_CODE_LENGTH);
  assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
});

test("l’adresse publique est courte", () => {
  assert.equal(entryLinkUrl("https://travelba.fr/", "K7MQ2PX4"), "https://travelba.fr/e/K7MQ2PX4");
  assert.equal("https://travelba.fr/e/K7MQ2PX4".length < 40, true);
});

test("WhatsApp reçoit le titre sans consommer le jeton", () => {
  assert.equal(isLinkCrawler("WhatsApp/2.23"), true);
  assert.equal(shouldServePreview("WhatsApp/2.23", null), true);
  assert.equal(shouldServePreview("Mozilla/5.0", null), true);
  assert.equal(shouldServePreview("Mozilla/5.0", "?1"), false);
  const html = entryPreviewHtml("https://travelba.fr", "K7MQ2PX4");
  assert.match(html, /<title>Le Concierge TBA<\/title>/);
  assert.match(html, /og:title" content="Le Concierge TBA"/);
  assert.match(html, /og:description" content="Votre espace vous attend."/);
  assert.match(html, /og:image" content="https:\/\/travelba\.fr\/og-concierge\.png"/);
  assert.match(html, /favicon\.png/);
  assert.equal(html.includes("token"), false);
  assert.equal(html.includes("hashed"), false);
});

test("le chemin de retour reste interne", () => {
  assert.equal(safeNextPath("/mon-compte"), "/mon-compte");
  assert.equal(safeNextPath("https://evil.example"), "/mon-compte");
  assert.equal(safeNextPath("//evil.example"), "/mon-compte");
});
