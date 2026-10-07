import { createOpenAI } from "@ai-sdk/openai";
import { generateImage, gateway } from "ai";
import { aiGatewayConfigured, openaiApiKey } from "@/lib/crm/ingest-types";

const PHOTO_ID = /^photo-[A-Za-z0-9_-]{6,80}$/;

export function isCatalogPhotoId(value: string) {
  return PHOTO_ID.test(value);
}

export function coverRetouchPrompt(place: string) {
  const lieu = place.replace(/\s+/g, " ").trim().slice(0, 80) || "this destination";
  return [
    `Retouch this real photograph of ${lieu}.`,
    "Luxury travel magazine: warm golden light, rich natural color, crisp detail, elegant wide composition.",
    "You may reframe and refine the scene. It must stay recognizably this exact place — same geography and landmarks.",
    "Do not invent another city, monument, or country.",
    "People only as a small distant presence. No close-up faces.",
    "No text, logos, watermarks, or frames.",
  ].join(" ");
}

export function retouchCachePath(sourceId: string) {
  const safe = sourceId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return `covers/retouched/${safe}.webp`;
}

export function catalogCachePath(photoId: string) {
  return `covers/catalog/${photoId}.webp`;
}

export function coverGeneratePrompt(place: string, country?: string) {
  const lieu = place.replace(/\s+/g, " ").trim().slice(0, 80) || "this city";
  const where = country?.trim() ? `${lieu}, ${country.trim()}` : lieu;
  return [
    `Create a wide photograph of ${where} for a luxury travel magazine.`,
    "Show this exact place: its real landmarks, architecture, water or landscape, and local light.",
    "Warm golden hour, rich natural color, crisp detail, elegant wide composition.",
    "Do not depict another city. Do not substitute the capital or a famous skyline from somewhere else.",
    "Do not show the Eiffel Tower, Notre-Dame, or a Paris street unless the place is Paris.",
    "People only as a small distant presence. No close-up faces.",
    "No text, logos, watermarks, or frames.",
  ].join(" ");
}

export type CoverImageGenerator = (prompt: string, bytes: Buffer) => Promise<Buffer | null>;
export type CoverPromptGenerator = (prompt: string) => Promise<Buffer | null>;

async function defaultGenerate(prompt: string, bytes: Buffer) {
  if (!aiGatewayConfigured()) return null;
  const key = openaiApiKey();
  const model = key
    ? createOpenAI({ apiKey: key }).imageModel("gpt-image-1")
    : gateway.imageModel("openai/gpt-image-1");
  const result = await generateImage({
    model,
    prompt: { text: prompt, images: [bytes] },
    size: "1536x1024",
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(90_000),
  });
  const raw = result.image?.uint8Array;
  if (!raw?.byteLength) return null;
  return Buffer.from(raw);
}

function cityImageModels() {
  const models: Array<Parameters<typeof generateImage>[0]["model"]> = [];
  const key = openaiApiKey();
  if (key) models.push(createOpenAI({ apiKey: key }).imageModel("gpt-image-1"));
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL) {
    models.push(gateway.imageModel("openai/gpt-image-1"));
  }
  return models;
}

async function defaultGenerateFromPrompt(prompt: string) {
  if (!aiGatewayConfigured()) return null;
  const models = cityImageModels();
  if (!models.length) return null;
  let last: unknown = null;
  for (const model of models) {
    try {
      const result = await generateImage({
        model,
        prompt,
        size: "1536x1024",
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(90_000),
      });
      const raw = result.image?.uint8Array;
      if (raw?.byteLength) return Buffer.from(raw);
    } catch (err) {
      last = err;
    }
  }
  if (last) throw last;
  return null;
}

let lastCityCoverError = "";

/** La clé ou la passerelle a refusé l’appel. Inutile de relancer tout le catalogue. */
export function cityCoverAuthFailed(message = lastCityCoverError) {
  return /incorrect api key|authentication failed|no authentication provided/i.test(message);
}

/** Image nouvelle d’une ville, sans photo source. Un essai, puis un retry. */
export async function generateCityCoverBytes(
  place: string,
  country?: string,
  generate: CoverPromptGenerator = defaultGenerateFromPrompt
) {
  const prompt = coverGeneratePrompt(place, country);
  lastCityCoverError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = await generate(prompt);
      if (next?.byteLength) {
        lastCityCoverError = "";
        return next;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "error";
      lastCityCoverError = detail;
      console.error(
        "[cover-generate]",
        attempt === 0 ? "retry" : "failed",
        detail.replace(/sk-\S+/g, "sk-REDACTED").slice(0, 240)
      );
    }
  }
  return null;
}

/** Un essai, puis un retry. Échec : null (l’appelant garde l’original ou le fond marine). */
export async function retouchCoverBytes(
  bytes: Buffer,
  place: string,
  generate: CoverImageGenerator = defaultGenerate
) {
  const prompt = coverRetouchPrompt(place);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = await generate(prompt, bytes);
      if (next?.byteLength) return next;
    } catch (err) {
      const detail = err instanceof Error ? err.message : "error";
      console.error(
        "[cover-retouch]",
        attempt === 0 ? "retry" : "failed",
        detail.replace(/sk-\S+/g, "sk-REDACTED").slice(0, 240)
      );
    }
  }
  return null;
}
