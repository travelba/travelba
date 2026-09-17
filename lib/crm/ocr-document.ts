import "server-only";
import { generateText, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { parseMrzFromOcr } from "./mrz-parse";
import {
  emptyToNull,
  humanizeMrzName,
  type ExtractedIdentity,
} from "./identity";
import { resolveCountryCode } from "./countries";
import { aiGatewayConfigured, openaiApiKey } from "./ingest-types";
import { trySharp } from "./sharp";
import { DOC_TYPES, type TravelDocType } from "./types";

const MAX_BYTES = 8 * 1024 * 1024;
const VISION_TIMEOUT_MS = 45_000;

const nullableString = z.string().nullable().optional();

const identityExtractSchema = z.object({
  doc_type: z.enum(DOC_TYPES).nullable().optional(),
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

function identityModel() {
  const key = openaiApiKey();
  if (key) return createOpenAI({ apiKey: key })("gpt-4o");
  return "google/gemini-2.5-flash";
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
        .resize({ width: 1800, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      image = new Uint8Array(jpeg);
      mediaType = "image/jpeg";
    } catch {
      if (mediaType.includes("heic") || mediaType.includes("heif")) {
        mediaType = "image/jpeg";
      }
    }
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
  if (value && (DOC_TYPES as readonly string[]).includes(value)) {
    return value as TravelDocType;
  }
  return "passport";
}

function fieldScore(identity: ExtractedIdentity) {
  const keys: (keyof ExtractedIdentity)[] = [
    "number",
    "last_name",
    "first_name",
    "birth_date",
    "expires_on",
    "nationality",
  ];
  return keys.reduce((sum, key) => sum + (identity[key] ? 1 : 0), 0);
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
  return fieldScore(identity) >= 2 ? identity : null;
}

function mergeIdentities(
  mrz: ExtractedIdentity | null,
  vision: ExtractedIdentity | null
): ExtractedIdentity | null {
  if (!mrz) return vision;
  if (!vision) return mrz;
  if (mrz.valid || fieldScore(mrz) >= fieldScore(vision)) {
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

async function extractWithVision(file: File): Promise<{
  identity: ExtractedIdentity | null;
  mrzText: string | null;
}> {
  if (!aiGatewayConfigured()) {
    throw new Error("Lecture automatique non configurée (OPENAI_API_KEY).");
  }

  const { image, mediaType } = await toVisionImage(file);
  const result = await withTimeout(
    generateText({
      model: identityModel(),
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
    }),
    VISION_TIMEOUT_MS,
    "Lecture trop longue. Réessayez avec une photo plus nette du bas du document."
  );

  if (!result.output) {
    return { identity: null, mrzText: null };
  }

  return {
    identity: fromVision(result.output),
    mrzText: emptyToNull(result.output.mrz_text),
  };
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
      warning: identity.valid
        ? null
        : "Lecture partielle : vérifiez chaque champ avant d’enregistrer.",
    };
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith("Lecture") || err.message.startsWith("Photo"))) {
      throw err;
    }
    throw new Error("Lecture OpenAI impossible. Vérifiez OPENAI_API_KEY et réessayez.");
  }
}
