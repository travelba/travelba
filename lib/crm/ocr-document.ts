import "server-only";
import { generateText, Output, APICallError } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { parseMrzFromOcr } from "./mrz-parse";
import {
  emptyToNull,
  humanizeMrzName,
  identityFieldScore,
  identityScanWarning,
  type ExtractedIdentity,
} from "./identity";
import { resolveCountryCode } from "./countries";
import { aiGatewayConfigured, openaiApiKey, preferAiGateway } from "./ingest-types";
import { trySharp } from "./sharp";
import { DOC_TYPES, type TravelDocType } from "./types";

const MAX_BYTES = 8 * 1024 * 1024;
const VISION_TIMEOUT_MS = 45_000;

const nullableString = z.string().nullable().optional();

const identityExtractSchema = z.object({
  doc_type: nullableString,
  number: nullableString,
  issuing_country: nullableString,
  expires_on: nullableString,
  first_name: nullableString,
  last_name: nullableString,
  birth_date: nullableString,
  nationality: nullableString,
  sex: nullableString,
  mrz_text: nullableString,
});

const PROMPT = `Tu lis une photo de passeport, carte d’identité ou titre de voyage.
Extrais uniquement ce qui est visible. Ne jamais inventer : mettre null.
Dates en YYYY-MM-DD.
Nationalité et pays émetteur : code ISO 2 lettres si possible (FR, US, GB…).
sex : M, F ou X.
doc_type : passport | id_card | visa | insurance | other.
mrz_text : recopie EXACTEMENT la bande MRZ (lignes du bas, caractères A-Z 0-9 <), une ligne par ligne, si elle est lisible. Sinon null.`;

function identityModel(gateway: boolean) {
  if (gateway) return "openai/gpt-4o";
  const key = openaiApiKey();
  if (key) return createOpenAI({ apiKey: key })("gpt-4o");
  return "openai/gpt-4o";
}

function isAbortError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
}

async function toVisionImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let mediaType = file.type || "image/jpeg";
  let image = bytes;

  const sharp = await trySharp();
  if (sharp) {
    try {
      const jpeg = await sharp(Buffer.from(bytes), { failOn: "none" })
        .rotate()
        .normalize()
        .sharpen()
        .resize({ width: 1800, withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      image = new Uint8Array(jpeg);
      mediaType = "image/jpeg";
    } catch (err) {
      console.error("[ocr-document] sharp", err);
    }
  }

  if (mediaType.includes("heic") || mediaType.includes("heif")) {
    throw new Error("Format HEIC illisible ici. Enregistrez la photo en JPEG ou PNG.");
  }

  return { image, mediaType };
}

function isoDate(value: string | null | undefined) {
  const text = emptyToNull(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const fr = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!fr) return null;
  return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
}

function mapSex(value: string | null | undefined): ExtractedIdentity["sex"] {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "m" || v === "male" || v === "homme" || v === "h") return "M";
  if (v === "f" || v === "female" || v === "femme") return "F";
  if (v === "x" || v === "autre" || v === "other") return "X";
  return null;
}

function mapDocType(value: string | null | undefined): TravelDocType {
  const raw = (value || "").trim().toLowerCase().replace(/['’]/g, " ");
  if (raw.includes("visa")) return "visa";
  if (raw.includes("assur")) return "insurance";
  if (
    raw.includes("id_card") ||
    raw.includes("carte") ||
    raw.includes("cni") ||
    raw.includes("identity") ||
    raw.includes("national id")
  ) {
    return "id_card";
  }
  if (raw && (DOC_TYPES as readonly string[]).includes(raw)) {
    return raw as TravelDocType;
  }
  if (raw && !raw.includes("pass")) return "other";
  return "passport";
}

function fromVision(raw: z.infer<typeof identityExtractSchema>): ExtractedIdentity | null {
  const identity: ExtractedIdentity = {
    doc_type: mapDocType(raw.doc_type),
    number: emptyToNull(raw.number)?.replace(/\s/g, "") || null,
    issuing_country: resolveCountryCode(raw.issuing_country) || emptyToNull(raw.issuing_country),
    expires_on: isoDate(raw.expires_on),
    first_name: raw.first_name ? humanizeMrzName(raw.first_name) : null,
    last_name: raw.last_name ? humanizeMrzName(raw.last_name) : null,
    birth_date: isoDate(raw.birth_date),
    nationality: resolveCountryCode(raw.nationality) || emptyToNull(raw.nationality),
    sex: mapSex(raw.sex),
    format: null,
    valid: false,
  };
  return identityFieldScore(identity) >= 2 ? identity : null;
}

function pickBest(
  a: ExtractedIdentity | null,
  b: ExtractedIdentity | null
): ExtractedIdentity | null {
  if (!a) return b;
  if (!b) return a;
  return identityFieldScore(b) > identityFieldScore(a) ? b : a;
}

function mergeIdentities(
  mrz: ExtractedIdentity | null,
  vision: ExtractedIdentity | null
): ExtractedIdentity | null {
  if (!mrz) return vision;
  if (!vision) return mrz;
  if (mrz.valid || identityFieldScore(mrz) >= identityFieldScore(vision)) {
    return {
      ...vision,
      ...Object.fromEntries(
        Object.entries(mrz).filter(([, value]) => value != null && value !== "")
      ),
      format: mrz.format,
      valid: mrz.valid,
    } as ExtractedIdentity;
  }
  return vision;
}

async function generateIdentity(
  image: Uint8Array,
  mediaType: string,
  useGateway: boolean
) {
  const result = await generateText({
    model: identityModel(useGateway),
    abortSignal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    output: Output.object({
      schema: identityExtractSchema,
      name: "identity",
      description: "Identité extraite du passeport ou de la pièce",
    }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image", image, mediaType },
        ],
      },
    ],
    ...(useGateway
      ? {
          providerOptions: {
            gateway: {
              tags: ["feature:passport-scan"],
              models: ["google/gemini-2.5-flash"],
            },
          },
        }
      : {}),
  });
  if (!result.output) {
    return { identity: null, mrzText: null };
  }
  return {
    identity: fromVision(result.output),
    mrzText: emptyToNull(result.output.mrz_text),
  };
}

async function cropMrzBand(image: Uint8Array) {
  const sharp = await trySharp();
  if (!sharp) return null;
  try {
    const meta = await sharp(Buffer.from(image), { failOn: "none" }).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (width < 200 || height < 200) return null;
    const top = Math.floor(height * 0.6);
    const jpeg = await sharp(Buffer.from(image), { failOn: "none" })
      .extract({ left: 0, top, width, height: height - top })
      .normalize()
      .sharpen()
      .jpeg({ quality: 90 })
      .toBuffer();
    return new Uint8Array(jpeg);
  } catch (err) {
    console.error("[ocr-document] mrz-crop", err);
    return null;
  }
}

async function extractWithVision(file: File): Promise<{
  identity: ExtractedIdentity | null;
  mrzText: string | null;
}> {
  if (!aiGatewayConfigured()) {
    throw new Error("Lecture automatique non configurée.");
  }

  const { image, mediaType } = await toVisionImage(file);
  const gateway = preferAiGateway();
  const key = openaiApiKey();
  let extracted: { identity: ExtractedIdentity | null; mrzText: string | null };
  try {
    extracted = await generateIdentity(image, mediaType, gateway);
  } catch (err) {
    if (
      key &&
      !gateway &&
      APICallError.isInstance(err) &&
      (err.statusCode === 401 || err.statusCode === 403)
    ) {
      console.error("[ocr-document] OpenAI 401, fallback AI Gateway");
      extracted = await generateIdentity(image, mediaType, true);
    } else {
      throw err;
    }
  }

  if (!extracted.identity || identityFieldScore(extracted.identity) < 4) {
    const crop = await cropMrzBand(image);
    if (crop) {
      try {
        const second = await generateIdentity(crop, "image/jpeg", true);
        extracted = {
          identity: pickBest(extracted.identity, second.identity),
          mrzText: second.mrzText || extracted.mrzText,
        };
      } catch (err) {
        console.error("[ocr-document] mrz-crop vision", err);
      }
    }
  }

  return extracted;
}

export async function scanTravelDocument(file: File): Promise<{
  identity: ExtractedIdentity | null;
  warning: string | null;
}> {
  if (file.size > MAX_BYTES) {
    throw new Error("Photo trop lourde (max 8 Mo).");
  }
  if (!file.type.startsWith("image/")) {
    return {
      identity: null,
      warning: "La lecture automatique fonctionne avec une photo (JPEG, PNG, HEIC…).",
    };
  }

  try {
    const { identity: vision, mrzText } = await extractWithVision(file);
    const mrz = mrzText ? parseMrzFromOcr(mrzText) : null;
    const identity = mergeIdentities(mrz, vision);

    if (!identity) {
      return {
        identity: null,
        warning:
          "Zone illisible. Cadrez le bas du passeport ou de la carte (bande de caractères) et réessayez.",
      };
    }

    return {
      identity,
      warning: identityScanWarning(identity),
    };
  } catch (err) {
    console.error("[ocr-document]", err);
    if (isAbortError(err)) {
      throw new Error("Lecture trop longue. Réessayez avec une photo plus nette du bas du document.");
    }
    if (err instanceof Error && (err.message.startsWith("Lecture") || err.message.startsWith("Photo") || err.message.startsWith("Format"))) {
      throw err;
    }
    throw new Error("Lecture du document impossible. Réessayez avec une photo plus nette du bas du document.");
  }
}
