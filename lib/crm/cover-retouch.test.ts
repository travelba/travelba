import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogCachePath,
  coverRetouchPrompt,
  isCatalogPhotoId,
  retouchCachePath,
  retouchCoverBytes,
} from "./cover-retouch";

describe("cover retouch", () => {
  it("verrouille le lieu et refuse un autre visage ou une autre ville", () => {
    const prompt = coverRetouchPrompt("Avoriaz");
    assert.match(prompt, /Avoriaz/);
    assert.match(prompt, /another city/i);
    assert.match(prompt, /close-up faces/i);
    assert.match(prompt, /No text/i);
  });

  it("réessaie une fois puis abandonne", async () => {
    let calls = 0;
    const out = await retouchCoverBytes(Buffer.from("img"), "Marrakech", async () => {
      calls += 1;
      throw new Error("down");
    });
    assert.equal(out, null);
    assert.equal(calls, 2);
  });

  it("ne relance pas si le premier essai réussit", async () => {
    let calls = 0;
    const out = await retouchCoverBytes(Buffer.from("img"), "Marrakech", async () => {
      calls += 1;
      return Buffer.from("ok");
    });
    assert.equal(calls, 1);
    assert.equal(out?.toString(), "ok");
  });

  it("cache une source stable", () => {
    assert.equal(retouchCachePath("photo-abc"), "covers/retouched/photo-abc.webp");
    assert.equal(catalogCachePath("photo-abc"), "covers/catalog/photo-abc.webp");
    assert.equal(isCatalogPhotoId("photo-1677837488142-a85ffbffe408"), true);
    assert.equal(isCatalogPhotoId("../cover.webp"), false);
  });
});
