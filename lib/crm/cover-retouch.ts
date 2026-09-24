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

export type CoverImageGenerator = (prompt: string, bytes: Buffer) => Promise<Buffer | null>;

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
