import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatedCityCoverJobs } from "./cover-catalog";
import {
  catalogCachePath,
  cityCoverAuthFailed,
  coverGeneratePrompt,
  coverImageModelIds,
  coverImageModels,
  coverScene,
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
    assert.equal(coverScene("Bordeaux"), "place");
    assert.doesNotMatch(prompt, /alpine ski resort/);
  });

  it("photographié Valmorel en station de ski l’hiver", () => {
    assert.equal(coverScene("Valmorel"), "ski");
    assert.equal(coverScene("Les Sybelles", { state: "Savoie", type: "village" }), "ski");
    assert.equal(coverScene("Lyon", { state: "Auvergne-Rhône-Alpes", type: "city" }), "place");
    const prompt = coverGeneratePrompt("Valmorel", "France");
    assert.match(prompt, /Valmorel, France/);
    assert.match(prompt, /alpine ski resort/);
    assert.match(prompt, /snow-covered mountains/);
    assert.match(prompt, /wooden chalets/);
    assert.match(prompt, /Eiffel Tower/);
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

  it("n’appelle plus gpt-image-1, retiré de la passerelle Vercel", () => {
    const ids = coverImageModelIds(undefined);
    assert.ok(ids.length >= 1);
    assert.equal(ids.includes("gpt-image-1"), false);
    assert.equal(ids[0], "gpt-image-1.5");
    assert.deepEqual(coverImageModelIds("openai/gpt-image-2, gpt-image-1-mini, ../x"), [
      "gpt-image-2",
      "gpt-image-1-mini",
    ]);
    assert.deepEqual(coverImageModelIds(" , "), ids);

    const previous = {
      VERCEL: process.env.VERCEL,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
    };
    try {
      process.env.VERCEL = "1";
      delete process.env.AI_GATEWAY_API_KEY;
      delete process.env.VERCEL_OIDC_TOKEN;
      const labels = coverImageModels({ ids: ["gpt-image-1.5", "gpt-image-1-mini"] }).map((m) => m.label);
      assert.ok(labels.includes("gateway:openai/gpt-image-1.5"));
      assert.ok(labels.includes("gateway:openai/gpt-image-1-mini"));
      assert.equal(labels.some((label) => label.endsWith("/gpt-image-1")), false);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("un modèle inconnu arrête les relances comme une clé refusée", async () => {
    assert.equal(cityCoverAuthFailed("Model 'openai/gpt-image-1' not found"), true);
    assert.equal(cityCoverAuthFailed("Request timed out"), false);
    let calls = 0;
    const out = await generateCityCoverBytes("Deauville", "France", async () => {
      calls += 1;
      throw new Error("Model 'openai/gpt-image-1' not found");
    });
    assert.equal(out, null);
    assert.equal(calls, 1);
    assert.equal(cityCoverAuthFailed(), true);
    const ok = await generateCityCoverBytes("Deauville", "France", async () => Buffer.from("ok"));
    assert.equal(ok?.toString(), "ok");
    assert.equal(cityCoverAuthFailed(), false);
  });

  it("cache une source stable", () => {
    assert.equal(retouchCachePath("photo-abc"), "covers/retouched/photo-abc.webp");
    assert.equal(catalogCachePath("photo-abc"), "covers/catalog/photo-abc.webp");
    assert.equal(isCatalogPhotoId("photo-1677837488142-a85ffbffe408"), true);
    assert.equal(isCatalogPhotoId("../cover.webp"), false);
  });
});
