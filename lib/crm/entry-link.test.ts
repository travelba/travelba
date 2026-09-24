import assert from "node:assert/strict";
import test from "node:test";
import {
  ENTRY_CODE_LENGTH,
  entryCode,
  entryCodeFromLink,
  entryButtonSuffix,
  entryLinkUrl,
  entryOpenRequested,
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
  assert.equal(entryLinkUrl("https://travelba.fr/", "K7MQ2PX4"), "https://travelba.fr/e/c/K7MQ2PX4");
  assert.equal(entryButtonSuffix("K7MQ2PX4"), "c/K7MQ2PX4");
  assert.equal("https://travelba.fr/e/c/K7MQ2PX4".length < 40, true);
  assert.equal(entryCodeFromLink("https://travelba.fr/e/c/K7MQ2PX4"), "K7MQ2PX4");
  assert.equal(entryCodeFromLink("https://travelba.fr/e/K7MQ2PX4"), "K7MQ2PX4");
  assert.equal(entryCodeFromLink("https://travelba.fr/auth/callback?token_hash=secret"), null);
});

test("WhatsApp reçoit le titre sans consommer le jeton", () => {
  assert.equal(isLinkCrawler("WhatsApp/2.23"), true);
  assert.equal(isLinkCrawler("facebookexternalhit/1.1"), true);
  assert.equal(shouldServePreview("WhatsApp/2.23.20.72 A", null), true);
  assert.equal(shouldServePreview("facebookexternalhit/1.1", "?1"), true);
  assert.equal(shouldServePreview("Mozilla/5.0", null), false);
  assert.equal(shouldServePreview("Mozilla/5.0 (iPhone) WhatsApp/2.23", "?1"), false);
  assert.equal(entryOpenRequested("?ouvrir=1"), true);
  assert.equal(entryOpenRequested(""), false);
  const html = entryPreviewHtml("https://travelba.fr", "K7MQ2PX4");
  assert.match(html, /<title>Le Concierge<\/title>/);
  assert.match(html, /og:title" content="Le Concierge"/);
  assert.match(html, /og:description" content="Votre espace personnel vous attend."/);
  assert.match(html, /og:url" content="https:\/\/travelba\.fr\/e\/c\/K7MQ2PX4"/);
  assert.match(html, /og:image" content="https:\/\/travelba\.fr\/og-concierge\.jpg"/);
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
  assert.match(html, /tba-mark\.png/);
  assert.match(html, /method="post"/);
  assert.match(html, /name="ouvrir"/);
  assert.match(html, /value="1"/);
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("location.replace"), false);
  assert.equal(html.includes("http-equiv"), false);
  assert.equal(html.includes("noindex"), false);
  assert.equal(html.includes("token"), false);
  assert.equal(html.includes("hashed"), false);
});

test("le chemin de retour reste interne", () => {
  assert.equal(safeNextPath("/mon-compte"), "/mon-compte");
  assert.equal(safeNextPath("https://evil.example"), "/mon-compte");
  assert.equal(safeNextPath("//evil.example"), "/mon-compte");
});
