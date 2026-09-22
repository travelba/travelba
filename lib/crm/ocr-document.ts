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
import {
  definePDFJSModule,
  extractImages,
  extractText,
  getDocumentProxy,
  renderPageAsImage,
} from "unpdf";

const MAX_BYTES = 12 * 1024 * 1024;
const VISION_TIMEOUT_MS = 45_000;
const PASSPORT_PDF_PAGES = 2;

const PROMPT = `Tu lis une photo ou un scan PDF de passeport, carte d’identité ou titre de voyage (zone visuelle + MRZ).
Extrais TOUS les champs visibles. Ne jamais inventer : mettre null si absent ou illisible.
Dates en YYYY-MM-DD.
Nationalité et pays émetteur : code ISO 2 lettres si possible (FR, US, GB…).
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

let officialPdfjs = false;

async function ensureOfficialPdfjs() {
  if (officialPdfjs) return;
  try {
    await definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
    officialPdfjs = true;
  } catch {
    try {
      await definePDFJSModule(() => import("pdfjs-dist"));
      officialPdfjs = true;
    } catch {
      /* bundled unpdf pdfjs */
    }
  }
}

async function jpegFromBytes(data: Uint8Array, raw?: { width: number; height: number; channels: 1 | 3 | 4 }) {
  const sharp = await trySharp();
  if (!sharp) return { image: data, mediaType: raw ? "image/jpeg" : "image/png" };
  try {
    const pipeline = raw
      ? sharp(data, { raw: { width: raw.width, height: raw.height, channels: raw.channels } })
      : sharp(data);
    const jpeg = await pipeline
      .rotate()
      .resize({ width: 1800, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { image: new Uint8Array(jpeg), mediaType: "image/jpeg" as const };
  } catch {
    return null;
  }
}

async function rasterPassportPdf(bytes: Uint8Array): Promise<{ image: Uint8Array; mediaType: string } | null> {
  await ensureOfficialPdfjs();
  const pdf = await getDocumentProxy(bytes);
  for (let page = 1; page <= PASSPORT_PDF_PAGES; page += 1) {
    try {
      const png = await renderPageAsImage(pdf, page, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: 1.6,
      });
      const part = await jpegFromBytes(new Uint8Array(png as ArrayBuffer));
      if (part) return part;
    } catch {
      /* embedded images */
    }
    try {
      const images = await extractImages(pdf, page);
      for (const img of images.slice(0, 2)) {
        const part = await jpegFromBytes(new Uint8Array(img.data), {
          width: img.width,
          height: img.height,
          channels: img.channels,
        });
        if (part) return part;
      }
    } catch {
      /* next page */
    }
  }
  return null;
}

async function mrzFromPdfText(bytes: Uint8Array) {
  try {
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    return parseMrzFromOcr(extracted.text || "");
  } catch {
    return null;
  }
}

async function toVisionImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isPdfFile(file.type, file.name)) {
    const raster = await rasterPassportPdf(bytes);
    if (!raster) {
      throw new Error("PDF illisible. Photographiez la page d’identité ou réessayez.");
    }
    return raster;
  }
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
    throw new Error("Fichier trop lourd (max 12 Mo).");
  }
  if (!isAllowedIngestType(file.type, file.name)) {
    return {
      identity: null,
      warning: "Formats acceptés : PDF, JPEG, PNG, HEIC.",
    };
  }

  const pdfBytes = isPdfFile(file.type, file.name)
    ? new Uint8Array(await file.arrayBuffer())
    : null;
  const pdfMrz = pdfBytes ? await mrzFromPdfText(pdfBytes) : null;

  try {
    const { identity: vision, mrzText } = await extractWithVision(file);
    const mrz = pdfMrz || (mrzText ? parseMrzFromOcr(mrzText) : null);
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
    if (pdfMrz) {
      return {
        identity: pdfMrz,
        warning: "Lecture partielle depuis le PDF : vérifiez chaque champ avant d’enregistrer.",
      };
    }
    console.error("[ocr-document]", err);
    if (isAbortError(err)) {
      throw new Error("Lecture trop longue. Réessayez avec une photo plus nette du bas du document.");
    }
    if (
      err instanceof Error &&
      (err.message.startsWith("Lecture") ||
        err.message.startsWith("Fichier") ||
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
    throw new Error("Lecture du document impossible. Réessayez avec une photo plus nette du bas du document.");
  }
}
