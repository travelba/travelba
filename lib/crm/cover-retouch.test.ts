import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatedCityCoverJobs } from "./cover-catalog";
import {
  catalogCachePath,
  cityCoverAuthFailed,
  coverGeneratePrompt,
  coverRetouchPrompt,
  generateCityCoverBytes,
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

  it("ne régénère pas une ville qui a déjà sa photo", () => {
    const jobs = generatedCityCoverJobs();
    assert.ok(jobs.some((job) => job.id === "photo-city-bordeaux" && job.place === "Bordeaux"));
    assert.equal(jobs.some((job) => job.place === "Paris"), false);
    assert.equal(jobs.some((job) => job.place === "Antibes"), false);
    assert.equal(new Set(jobs.map((job) => job.id)).size, jobs.length);
    assert.equal(cityCoverAuthFailed("Incorrect API key provided"), true);
    assert.equal(cityCoverAuthFailed("timeout"), false);
  });

  it("invente Bordeaux, pas Paris", () => {
    const prompt = coverGeneratePrompt("Bordeaux", "France");
    assert.match(prompt, /Bordeaux, France/);
    assert.match(prompt, /Eiffel Tower/);
    assert.match(prompt, /unless the place is Paris/);
  });

  it("réessaie la génération une fois puis abandonne", async () => {
    let calls = 0;
    const out = await generateCityCoverBytes("Bordeaux", "France", async () => {
      calls += 1;
      throw new Error("down");
    });
    assert.equal(out, null);
    assert.equal(calls, 2);
  });

  it("cache une source stable", () => {
    assert.equal(retouchCachePath("photo-abc"), "covers/retouched/photo-abc.webp");
    assert.equal(catalogCachePath("photo-abc"), "covers/catalog/photo-abc.webp");
    assert.equal(isCatalogPhotoId("photo-1677837488142-a85ffbffe408"), true);
    assert.equal(isCatalogPhotoId("../cover.webp"), false);
  });
});
