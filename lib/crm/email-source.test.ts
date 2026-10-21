import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emailHtmlHasText, sanitizeEmailHtml } from "./email-source";

describe("sanitizeEmailHtml", () => {
  it("retire script et gestionnaires, garde le texte et un lien https", () => {
    const html = sanitizeEmailHtml(
      `<p onclick="alert(1)">Bonjour</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://example.com/stay">Lire</a>`
    );
    assert.equal(html.includes("script"), false);
    assert.equal(html.includes("onclick"), false);
    assert.equal(html.includes("javascript:"), false);
    assert.match(html, /Bonjour/);
    assert.match(html, /href="https:\/\/example.com\/stay"/);
  });

  it("une coquille Gmail vide n’est pas un message", () => {
    assert.equal(emailHtmlHasText('<div dir="ltr"><br></div>'), false);
    assert.equal(emailHtmlHasText("<p>Bonjour</p>"), true);
    assert.equal(emailHtmlHasText(""), false);
  });
});
