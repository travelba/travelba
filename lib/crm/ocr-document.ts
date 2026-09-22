import "server-only";
import { generateText, Output, APICallError } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { parseMrzFromOcr } from "./mrz-parse";
import { emptyToNull, type ExtractedIdentity } from "./identity";
import {
  identityFromVision,
  mergePassportIdentities,
} from "./passport-extract";
import { aiGatewayConfigured, isAllowedIngestType, isPdfFile, openaiApiKey } from "./ingest-types";
import { identityExtractSchema } from "./ocr-schema";
import { trySharp } from "./sharp";
import { inspectPdf, type RasterPage } from "./pdf-raster";

const MAX_BYTES = 12 * 1024 * 1024;
const VISION_TIMEOUT_MS = 45_000;
const PASSPORT_PDF_PAGES = 2;

const PROMPT = `Tu lis une photo ou un scan PDF de passeport, carte d’identité ou titre de voyage (zone visuelle + MRZ).
Extrais TOUS les champs visibles. Ne jamais inventer : mettre null si absent ou illisible.
Dates en YYYY-MM-DD.
Nationalité : code ISO 2 lettres UNIQUEMENT (FR, MA, US, GB). Jamais l’adjectif (Française, Marocaine) ni le nom du pays.
Pays émetteur : même règle ISO 2.
sex : M, F ou X.
doc_type : passport | id_card | visa | insurance | other.
first_name : TOUS les prénoms imprimés (ligne « Prénoms » / Given names), dans l’ordre du document, séparés par un espace. Ne jamais n’en garder qu’un. Ne pas réordonner. Conserver les traits d’union (Jean-Pierre).
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

function isPdfEngineError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /API version|Worker version|DataCloneError|Cannot transfer object/i.test(message);
}

async function toVisionImages(
  bytes: Uint8Array,
  type: string,
  name: string
): Promise<RasterPage[]> {
  if (isPdfFile(type, name)) {
    const inspected = await inspectPdf(bytes, PASSPORT_PDF_PAGES);
    if (!inspected.rasters.length) {
      throw new Error(
        "Impossible de lire ce PDF. Essayez une photo JPEG de la page d’identité."
      );
    }
    return inspected.rasters;
  }

  let mediaType = type || "image/jpeg";
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

  return [{ image, mediaType: mediaType as RasterPage["mediaType"] }];
}

async function generateIdentity(pages: RasterPage[], useGateway: boolean) {
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
          ...pages.map((page) => ({
            type: "image" as const,
            image: page.image,
            mediaType: page.mediaType,
          })),
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

async function extractWithVision(pages: RasterPage[]): Promise<{
  identity: ExtractedIdentity | null;
  mrzText: string | null;
}> {
  if (!aiGatewayConfigured()) {
    throw new Error("Lecture automatique non configurée.");
  }

  const key = openaiApiKey();
  try {
    return await generateIdentity(pages, !key);
  } catch (err) {
    if (
      key &&
      APICallError.isInstance(err) &&
      (err.statusCode === 401 || err.statusCode === 403)
    ) {
      console.error("[ocr-document] OpenAI 401, fallback AI Gateway");
      return generateIdentity(pages, true);
    }
    throw err;
  }
}

export async function scanTravelDocument(file: File): Promise<{
  identity: ExtractedIdentity | null;
  warning: string | null;
}> {
  if (file.size > MAX_BYTES) {
    throw new Error("Fichier trop lourd (max 12 Mo).");
  }
  if (!isAllowedIngestType(file.type, file.name)) {
    return {
      identity: null,
      warning: "Formats acceptés : PDF, JPEG, PNG, HEIC.",
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = isPdfFile(file.type, file.name);
  let pdfMrz = null as ReturnType<typeof parseMrzFromOcr>;
  let pages: RasterPage[];

  try {
    if (isPdf) {
      const inspected = await inspectPdf(bytes, PASSPORT_PDF_PAGES);
      pdfMrz = parseMrzFromOcr(inspected.text);
      if (!inspected.rasters.length) {
        throw new Error(
          "Impossible de lire ce PDF. Essayez une photo JPEG de la page d’identité."
        );
      }
      pages = inspected.rasters;
    } else {
      pages = await toVisionImages(bytes, file.type, file.name);
    }

    const { identity: vision, mrzText } = await extractWithVision(pages);
    const mrz = pdfMrz || (mrzText ? parseMrzFromOcr(mrzText) : null);
    const identity = mergePassportIdentities(mrz, vision);

    if (!identity) {
      return {
        identity: null,
        warning: isPdf
          ? "PDF lu, mais l’identité n’est pas assez nette. Essayez une photo JPEG de la page d’identité."
          : "Zone illisible. Cadrez le bas du passeport ou de la carte (bande de caractères) et réessayez.",
      };
    }

    return {
      identity,
      warning: identity.valid
        ? null
        : "Lecture partielle : vérifiez chaque champ avant d’enregistrer.",
    };
  } catch (err) {
    if (pdfMrz) {
      return {
        identity: pdfMrz,
        warning: "Lecture partielle depuis le PDF : vérifiez chaque champ avant d’enregistrer.",
      };
    }
    console.error("[ocr-document]", err);
    if (isAbortError(err)) {
      throw new Error(
        isPdf
          ? "Lecture du PDF trop longue. Réessayez, ou photographiez la page d’identité."
          : "Lecture trop longue. Réessayez avec une photo plus nette du bas du document."
      );
    }
    if (
      err instanceof Error &&
      (err.message.startsWith("Lecture") ||
        err.message.startsWith("Fichier") ||
        err.message.startsWith("Impossible") ||
        err.message.startsWith("PDF") ||
        err.message.startsWith("Format"))
    ) {
      throw err;
    }
    if (APICallError.isInstance(err) && err.statusCode === 400) {
      const detail =
        typeof err.data === "object" &&
        err.data &&
        "error" in err.data &&
        typeof (err.data as { error?: { message?: string } }).error?.message === "string"
          ? (err.data as { error: { message: string } }).error.message
          : err.message;
      console.error("[ocr-document] openai_schema_or_request", detail);
      throw new Error("Lecture automatique indisponible temporairement. Réessayez dans un instant.");
    }
    if (isPdf || isPdfEngineError(err)) {
      throw new Error(
        "Impossible de lire ce PDF. Essayez une photo JPEG de la page d’identité."
      );
    }
    throw new Error("Lecture du document impossible. Réessayez avec une photo plus nette du bas du document.");
  }
}
