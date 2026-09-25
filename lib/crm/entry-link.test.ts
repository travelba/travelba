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
  referenceFromNextPath,
  safeNextPath,
  shouldServePreview,
  stayPreviewCopy,
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
  assert.equal(shouldServePreview("WhatsApp/2.23.20.72 I", null), true);
  assert.equal(shouldServePreview("WhatsApp/2.23.20.72 A", "?1"), false);
  assert.equal(
    shouldServePreview("WhatsApp/2.23.20.72 A", null, { mode: "navigate", dest: "document" }),
    false
  );
  assert.equal(shouldServePreview("facebookexternalhit/1.1", "?1"), true);
  assert.equal(shouldServePreview("Mozilla/5.0", null), false);
  assert.equal(shouldServePreview("Mozilla/5.0 (iPhone) WhatsApp/2.23", "?1"), false);
  assert.equal(entryOpenRequested("?ouvrir=1"), true);
  assert.equal(entryOpenRequested(""), false);
  const stay = stayPreviewCopy({
    origin: "https://travelba.fr",
    reference: "TB-2026-0004",
    place: "Avoriaz",
    hasCover: true,
  });
  assert.equal(stay.title, "Séjour à Avoriaz");
  assert.equal(stay.description, "Réservation TB-2026-0004 · Travel Business Agency");
  assert.equal(stay.image, "https://travelba.fr/api/covers/sejour/TB-2026-0004");
  assert.equal(referenceFromNextPath("/mon-compte/reservations/TB-2026-0004"), "TB-2026-0004");
  assert.equal(referenceFromNextPath("/mon-compte"), null);
  const html = entryPreviewHtml("https://travelba.fr", "K7MQ2PX4", stay);
  assert.match(html, /<title>Séjour à Avoriaz<\/title>/);
  assert.match(html, /og:title" content="Séjour à Avoriaz"/);
  assert.match(html, /og:description" content="Réservation TB-2026-0004 · Travel Business Agency"/);
  assert.match(html, /og:url" content="https:\/\/travelba\.fr\/e\/c\/K7MQ2PX4"/);
  assert.match(html, /og:image" content="https:\/\/travelba\.fr\/api\/covers\/sejour\/TB-2026-0004"/);
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
  assert.match(html, /favicon\.ico/);
  assert.equal(html.includes("og-concierge"), false);
  assert.equal(html.includes("tba-mark"), false);
  assert.match(html, /method="post"/);
  assert.match(html, /name="ouvrir"/);
  assert.match(html, /value="1"/);
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("location.replace"), false);
  assert.equal(html.includes("http-equiv"), false);
  assert.equal(html.includes("noindex"), false);
  assert.equal(html.includes("token"), false);
  assert.equal(html.includes("hashed"), false);
  const bare = entryPreviewHtml("https://travelba.fr", "K7MQ2PX4");
  assert.match(bare, /<title>Le Concierge<\/title>/);
  assert.equal(bare.includes("og:image"), false);
  assert.equal(bare.includes("og-concierge"), false);
  assert.match(bare, /favicon\.ico/);
  const noCover = entryPreviewHtml(
    "https://travelba.fr",
    "K7MQ2PX4",
    stayPreviewCopy({
      origin: "https://travelba.fr",
      reference: "TB-2026-0004",
      place: "Avoriaz",
      hasCover: false,
    })
  );
  assert.match(noCover, /Séjour à Avoriaz/);
  assert.equal(noCover.includes("og:image"), false);
});

test("le chemin de retour reste interne", () => {
  assert.equal(safeNextPath("/mon-compte"), "/mon-compte");
  assert.equal(safeNextPath("https://evil.example"), "/mon-compte");
  assert.equal(safeNextPath("//evil.example"), "/mon-compte");
});
