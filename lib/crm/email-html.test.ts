import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agencyEmailHtml, greetingName } from "./email-html";

describe("greetingName", () => {
  it("joins comma-separated first names with et", () => {
    assert.equal(greetingName("Simon, Iony"), "Simon et Iony");
  });

  it("keeps a single first name", () => {
    assert.equal(greetingName("Simon"), "Simon");
  });

  it("returns empty when missing", () => {
    assert.equal(greetingName(""), "");
    assert.equal(greetingName(null), "");
  });
});

describe("agencyEmailHtml", () => {
  const html = agencyEmailHtml({
    title: "Votre espace est prêt",
    bodyHtml: "<p>Bonjour Simon et Iony,</p>",
    ctaLabel: "Accéder à mon espace",
    ctaHref: "https://travelba.fr/auth/callback?token_hash=abc",
    footnote: "Si vous n’êtes pas à l’origine de cette invitation, ignorez cet e-mail.",
    preheader: "Définissez votre mot de passe",
  });

  it("uses the message as the title, not the TBA acronym", () => {
    assert.match(html, /<h1[^>]*>Votre espace est prêt<\/h1>/);
    assert.doesNotMatch(html, /<h1[^>]*>TBA<\/h1>/);
  });

  it("keeps the wordmark in the navy band", () => {
    assert.match(html, /background:#0B192C/);
    assert.match(html, /Travel Business Agency/);
  });

  it("forces muted color on phone and email", () => {
    assert.match(html, /href="tel:\+33756841315"[^>]*color:#5C6570/);
    assert.match(html, /href="mailto:contact@travelba\.fr"[^>]*color:#5C6570/);
  });

  it("includes a hidden preheader and the address", () => {
    assert.match(html, /display:none/);
    assert.match(html, /Levallois-Perret/);
  });
});
