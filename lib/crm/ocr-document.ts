import "server-only";
import { generateText, Output, APICallError } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { parseMrzFromOcr } from "./mrz-parse";
import { emptyToNull, type ExtractedIdentity } from "./identity";
import {
  identityFromVision,
  mergePassportIdentities,
} from "./passport-extract";
import { aiGatewayConfigured, openaiApiKey } from "./ingest-types";
import { trySharp } from "./sharp";

const MAX_BYTES = 8 * 1024 * 1024;
const VISION_TIMEOUT_MS = 45_000;

const nullableString = z.string().nullable().optional();

const identityExtractSchema = z.object({
  doc_type: nullableString,
  number: nullableString,
  issuing_country: nullableString,
  issued_on: nullableString,
  expires_on: nullableString,
  first_name: nullableString,
  last_name: nullableString,
  birth_date: nullableString,
  place_of_birth: nullableString,
  nationality: nullableString,
  sex: nullableString,
  authority: nullableString,
  personal_number: nullableString,
  mrz_text: nullableString,
});

const PROMPT = `Tu lis une photo de passeport, carte d’identité ou titre de voyage (zone visuelle + MRZ).
Extrais TOUS les champs visibles. Ne jamais inventer : mettre null si absent ou illisible.
Dates en YYYY-MM-DD.
Nationalité et pays émetteur : code ISO 2 lettres si possible (FR, US, GB…).
sex : M, F ou X.
doc_type : passport | id_card | visa | insurance | other.
first_name : tous les prénoms, dans l’ordre.
last_name : nom de famille.
place_of_birth : lieu de naissance (ville / pays), tel qu’imprimé.
issued_on : date de délivrance.
expires_on : date d’expiration.
authority : autorité de délivrance (préfecture, ministère…).
personal_number : n° personnel / national / optionnel s’il figure.
number : n° du document (passeport ou CNI).
mrz_text : recopie EXACTEMENT la bande MRZ (lignes du bas, caractères A-Z 0-9 <), une ligne par ligne, si elle est lisible. Sinon null.`;

function identityModel() {
  const key = openaiApiKey();
  if (key) return createOpenAI({ apiKey: key })("gpt-4o");
  // Sur Vercel : OIDC → AI Gateway, sans OPENAI_API_KEY.
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
        .resize({ width: 1800, withoutEnlargement: true })
        .jpeg({ quality: 85 })
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

async function generateIdentity(
  image: Uint8Array,
  mediaType: string,
  useGateway: boolean
) {
  const result = await generateText({
    model: useGateway ? "openai/gpt-4o" : identityModel(),
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
    identity: identityFromVision(result.output as Record<string, unknown>),
    mrzText: emptyToNull(result.output.mrz_text),
  };
}

async function extractWithVision(file: File): Promise<{
  identity: ExtractedIdentity | null;
  mrzText: string | null;
}> {
  if (!aiGatewayConfigured()) {
    throw new Error("Lecture automatique non configurée.");
  }

  const { image, mediaType } = await toVisionImage(file);
  const key = openaiApiKey();
  try {
    return await generateIdentity(image, mediaType, !key);
  } catch (err) {
    if (
      key &&
      APICallError.isInstance(err) &&
      (err.statusCode === 401 || err.statusCode === 403)
    ) {
      console.error("[ocr-document] OpenAI 401, fallback AI Gateway");
      return generateIdentity(image, mediaType, true);
    }
    throw err;
  }
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
    const identity = mergePassportIdentities(mrz, vision);

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
