import "server-only";
import { after } from "next/server";
import { generateImage, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createServiceClient } from "@/lib/supabase/admin";
import { uploadCrmFile } from "@/lib/crm/files";
import { openaiApiKey } from "@/lib/crm/ingest-types";
import type { CrmBooking } from "@/lib/crm/types";
import { trySharp } from "@/lib/crm/sharp";
import { coverQuery } from "@/lib/crm/carnet";

const IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

export function coverStoragePath(bookingId: string) {
  return `bookings/${bookingId}/cover.webp`;
}

export function isCoverStoragePath(path: string) {
  return /^bookings\/[^/]+\/cover\.(webp|jpe?g|png)$/i.test(path);
}

function placeName(booking: Pick<CrmBooking, "destination" | "title">, hotel?: string | null) {
  const dest = coverQuery(booking.destination, booking.title);
  if (dest && dest !== "voyage") return dest;
  const hotelName = (hotel || "").trim();
  if (hotelName) return hotelName;
  return dest || "voyage";
}

function coverPrompt(place: string, hotel?: string | null) {
  const setting = hotel
    ? `${place}, with the atmosphere of ${hotel} in its real geographic setting`
    : place;
  return [
    `Award-winning cinematic travel photograph of ${setting}.`,
    "Photorealistic, 16:9 landscape, golden hour, luxury magazine cover quality.",
    "The single most iconic view of this destination (landmark, coast, jungle, lake or city skyline as appropriate).",
    "Natural colors, razor-sharp details, shallow atmospheric perspective.",
    "No text, no watermark, no logos, no frames, no collage, no people in the foreground.",
  ].join(" ");
}

async function toWebp(bytes: Buffer) {
  const sharp = await trySharp();
  if (!sharp) return bytes;
  return sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ width: 1600, height: 900, fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}

function fileBytes(file: {
  uint8Array?: Uint8Array;
  base64?: string;
  mediaType?: string;
}) {
  if (file.uint8Array?.length) return Buffer.from(file.uint8Array);
  if (file.base64) {
    const raw = file.base64.includes(",") ? file.base64.split(",")[1] : file.base64;
    return Buffer.from(raw, "base64");
  }
  return null;
}

async function openaiCoverBytes(prompt: string) {
  const key = openaiApiKey();
  if (!key) return null;
  const openai = createOpenAI({ apiKey: key });

  try {
    const { image } = await generateImage({
      model: openai.image("gpt-image-1"),
      prompt,
      size: "1536x1024",
      abortSignal: AbortSignal.timeout(45000),
    });
    if (image?.uint8Array?.length) return Buffer.from(image.uint8Array);
    if (image?.base64) return Buffer.from(image.base64, "base64");
  } catch {
    /* REST fallback */
  }

  for (const body of [
    { model: "gpt-image-1", prompt, size: "1536x1024" },
    {
      model: "dall-e-3",
      prompt,
      size: "1792x1024",
      quality: "hd",
      response_format: "b64_json",
    },
  ]) {
    const timeout = AbortSignal.timeout(45000);
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: timeout,
    });
    if (!res.ok) continue;
    const json = (await res.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const row = json.data?.[0];
    if (row?.b64_json) return Buffer.from(row.b64_json, "base64");
    if (row?.url) {
      const img = await fetch(row.url, { signal: timeout });
      if (img.ok) return Buffer.from(await img.arrayBuffer());
    }
  }
  return null;
}

async function generateCoverBytes(place: string, hotel?: string | null) {
  const prompt = coverPrompt(place, hotel);

  const fromOpenAI = await openaiCoverBytes(prompt);
  if (fromOpenAI) return fromOpenAI;

  if (!process.env.AI_GATEWAY_API_KEY) return null;

  const timeout = AbortSignal.timeout(25000);
  try {
    const result = await generateText({
      model: IMAGE_MODEL,
      prompt,
      abortSignal: timeout,
    });
    const image = result.files?.find((file) => file.mediaType?.startsWith("image/"));
    const bytes = image ? fileBytes(image) : null;
    if (bytes) return bytes;
  } catch {
    /* try dedicated image API */
  }
  try {
    const { image } = await generateImage({
      model: IMAGE_MODEL,
      prompt,
      aspectRatio: "16:9",
      abortSignal: timeout,
    });
    if (image?.uint8Array?.length) return Buffer.from(image.uint8Array);
    if (image?.base64) return Buffer.from(image.base64, "base64");
  } catch {
    /* none */
  }
  return null;
}

export async function ensureBookingCover(
  booking: Pick<CrmBooking, "id" | "destination" | "title" | "cover_image_path">,
  opts?: { hotel?: string | null; force?: boolean }
) {
  if (booking.cover_image_path && !opts?.force) return booking.cover_image_path;
  const place = placeName(booking, opts?.hotel);
  if (!place) return null;
  const raw = await generateCoverBytes(place, opts?.hotel);
  if (!raw) return null;
  const webp = await toWebp(raw);
  const path = coverStoragePath(booking.id);
  await uploadCrmFile(path, webp, "image/webp", { upsert: true });
  const admin = createServiceClient();
  await admin.from("crm_bookings").update({ cover_image_path: path }).eq("id", booking.id);
  return path;
}

export function scheduleBookingCover(
  booking: Pick<CrmBooking, "id" | "destination" | "title" | "cover_image_path">,
  opts?: { hotel?: string | null; force?: boolean }
) {
  const run = () => ensureBookingCover(booking, opts).catch(() => null);
  try {
    after(run);
  } catch {
    void run();
  }
}
