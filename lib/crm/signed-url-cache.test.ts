import assert from "node:assert/strict";
import test from "node:test";
import { reusableSignedUrl, signedUrlMarginMs } from "./signed-url-cache";

test("une URL signée de 10 minutes est réutilisée jusqu’à la dernière minute", () => {
  assert.equal(signedUrlMarginMs(600), 60_000);
  const entry = { url: "https://files.example/a", expiresAtMs: 600_000 };
  assert.equal(reusableSignedUrl(entry, 500_000, 60_000), entry.url);
  assert.equal(reusableSignedUrl(entry, 540_000, 60_000), null);
  assert.equal(reusableSignedUrl(undefined, 0, 60_000), null);
});

test("une URL courte garde une marge d’au moins cinq secondes", () => {
  assert.equal(signedUrlMarginMs(20), 5_000);
  const entry = { url: "https://files.example/b", expiresAtMs: 20_000 };
  assert.equal(reusableSignedUrl(entry, 14_000, 5_000), entry.url);
  assert.equal(reusableSignedUrl(entry, 15_000, 5_000), null);
});
