import "server-only";
import { generateText, Output, APICallError } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { parseMrzFromOcrAll } from "./mrz-parse";
import { emptyToNull, type ExtractedIdentity } from "./identity";
import {
  distinctPassportPeople,
  fieldScore,
  identityFromVision,
  mergePassportSets,
  uniquePassports,
} from "./passport-extract";
import { aiGatewayConfigured, isAllowedIngestType, isPdfFile, openaiApiKey } from "./ingest-types";
import { identitiesExtractSchema } from "./ocr-schema";
import { trySharp } from "./sharp";
import { inspectPdf, type RasterPage } from "./pdf-raster";
import { multiPassportCrops, type CropRect } from "./passport-split";

const MAX_BYTES = 12 * 1024 * 1024;
const VISION_TIMEOUT_MS = 60_000;
const PASSPORT_PDF_PAGES = 6;

const PROMPT = `Tu lis une photo ou un scan PDF de passeport, carte d’identité ou titre de voyage (zone visuelle + MRZ).
Le fichier peut contenir PLUSIEURS passeports (deux livrets ouverts sur la même page, photocopie de couple, PDF de plusieurs pages).
Si tu vois 2 passeports, identities DOIT contenir 2 objets. Si tu en vois 3, 3 objets. Un objet par personne, jamais fusionnés.
Plusieurs images peuvent être le même scan découpé (gauche / droite / bas) : dédupe par personne.

Extrais TOUS les champs visibles. Ne jamais inventer : mettre null si absent ou illisible.
Dates en YYYY-MM-DD.
Nationalité : code ISO 2 lettres UNIQUEMENT (FR, MA, US, GB). Jamais l’adjectif (Française, Marocaine) ni le nom du pays.
Pays émetteur : même règle ISO 2.
sex : M, F ou X.
doc_type : passport | id_card | visa | insurance | other.
first_name : TOUS les prénoms imprimés (ligne « Prénoms » / Given names), dans l’ordre du document, séparés par un espace. Ne jamais n’en garder qu’un. Ne pas réordonner. Conserver les traits d’union (Jean-Pierre).
last_name : nom de naissance (ligne « Nom » / Surname). Pas le nom d’usage.
usage_name : nom d’épouse ou nom d’usage, s’il est imprimé (ligne « Nom d’usage », « épouse », « ép. », « née »). Null s’il n’y en a pas. Ne jamais l’inventer, ne pas le mettre dans last_name ni dans les prénoms.
place_of_birth : lieu de naissance (ville / pays), tel qu’imprimé.
issued_on : date de délivrance.
expires_on : date d’expiration.
authority : autorité de délivrance (préfecture, ministère…).
personal_number : n° personnel / national / optionnel s’il figure.
number : n° du document (passeport ou CNI).
mrz_text : recopie EXACTEMENT la bande MRZ de CETTE personne (lignes du bas, caractères A-Z 0-9 <), une ligne par ligne, si elle est lisible. Sinon null.`;

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

async function cropPage(
  sharp: NonNullable<Awaited<ReturnType<typeof trySharp>>>,
  buf: Buffer,
  rect: CropRect
): Promise<RasterPage | null> {
  if (rect.width < 80 || rect.height < 80) return null;
  try {
    const jpeg = await sharp(buf, { failOn: "none" })
      .extract(rect)
      .jpeg({ quality: 85 })
      .toBuffer();
    return { image: new Uint8Array(jpeg), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

async function expandPassportViews(pages: RasterPage[]): Promise<RasterPage[]> {
  const sharp = await trySharp();
  if (!sharp) return pages;
  const views: RasterPage[] = [...pages];
  for (const page of pages) {
    try {
      const buf = Buffer.from(page.image);
      const meta = await sharp(buf, { failOn: "none" }).metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      for (const rect of multiPassportCrops(width, height)) {
        const part = await cropPage(sharp, buf, rect);
        if (part) views.push(part);
      }
    } catch {
      /* page suivante */
    }
  }
  return views.slice(0, 6);
}

async function splitWidePages(pages: RasterPage[]): Promise<RasterPage[]> {
  const sharp = await trySharp();
  if (!sharp) return [];
  const halves: RasterPage[] = [];
  for (const page of pages) {
    try {
      const buf = Buffer.from(page.image);
      const meta = await sharp(buf, { failOn: "none" }).metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      for (const rect of multiPassportCrops(width, height)) {
        const part = await cropPage(sharp, buf, rect);
        if (part) halves.push(part);
      }
    } catch {
      /* page suivante */
    }
  }
  return halves;
}

async function extractMoreIdentities(
  pages: RasterPage[],
  already: ExtractedIdentity[]
): Promise<{ identities: ExtractedIdentity[]; mrzText: string | null }> {
  if (already.length >= 2 && (pages.length <= 1 || already.length >= pages.length)) {
    return { identities: already, mrzText: null };
  }
  const extras: RasterPage[] =
    pages.length > 1 ? pages : await splitWidePages(pages);
  if (extras.length < 2 && pages.length <= 1) {
    return { identities: already, mrzText: null };
  }
  const found: ExtractedIdentity[] = [...already];
  const mrzParts: string[] = [];
  const batches = pages.length > 1 ? pages.map((page) => [page]) : extras.map((page) => [page]);
  for (const batch of batches) {
    try {
      const extra = await extractWithVision(batch);
      found.push(...extra.identities);
      if (extra.mrzText) mrzParts.push(extra.mrzText);
    } catch (err) {
      console.error("[ocr-document] extra-page", err instanceof Error ? err.name : "error");
    }
  }
  return { identities: uniquePassports(found), mrzText: mrzParts.join("\n") || null };
}

function scanResult(identities: ExtractedIdentity[], warning: string | null) {
  const unique = distinctPassportPeople(identities);
  return {
    identities: unique,
    identity: unique[0] || null,
    warning,
  };
}

async function generateIdentities(pages: RasterPage[], useGateway: boolean) {
  const result = await generateText({
    model: useGateway ? "openai/gpt-4o" : identityModel(),
    abortSignal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    output: Output.object({
      schema: identitiesExtractSchema,
      name: "identities",
      description: "Tous les passeports visibles, un objet par personne",
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
  const rows = result.output?.identities || [];
  const identities = rows
    .map((row) => identityFromVision(row as Record<string, unknown>))
    .filter((identity): identity is ExtractedIdentity => Boolean(identity));
  const mrzText = rows
    .map((row) => emptyToNull(row.mrz_text))
    .filter((text): text is string => Boolean(text))
    .join("\n");
  return { identities, mrzText: mrzText || null };
}

async function extractWithVision(pages: RasterPage[]): Promise<{
  identities: ExtractedIdentity[];
  mrzText: string | null;
}> {
  if (!aiGatewayConfigured()) {
    throw new Error("Lecture automatique non configurée.");
  }

  const key = openaiApiKey();
  try {
    return await generateIdentities(pages, !key);
  } catch (err) {
    if (
      key &&
      APICallError.isInstance(err) &&
      (err.statusCode === 401 || err.statusCode === 403)
    ) {
      console.error("[ocr-document] OpenAI 401, fallback AI Gateway");
      return generateIdentities(pages, true);
    }
    throw err;
  }
}

export async function scanTravelDocument(file: File): Promise<{
  identities: ExtractedIdentity[];
  identity: ExtractedIdentity | null;
  warning: string | null;
}> {
  if (file.size > MAX_BYTES) {
    throw new Error("Fichier trop lourd (max 12 Mo).");
  }
  if (!isAllowedIngestType(file.type, file.name)) {
    return scanResult([], "Formats acceptés : PDF, JPEG, PNG, HEIC.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = isPdfFile(file.type, file.name);
  let pdfMrz: ExtractedIdentity[] = [];
  let pages: RasterPage[];

  try {
    if (isPdf) {
      const inspected = await inspectPdf(bytes, PASSPORT_PDF_PAGES);
      pdfMrz = parseMrzFromOcrAll(inspected.text);
      if (!inspected.rasters.length) {
        throw new Error(
          "Impossible de lire ce PDF. Essayez une photo JPEG de la page d’identité."
        );
      }
      pages = inspected.rasters;
    } else {
      pages = await toVisionImages(bytes, file.type, file.name);
    }

    const views = await expandPassportViews(pages);
    const visionFirst = await extractWithVision(views);
    const visionMore = await extractMoreIdentities(pages, visionFirst.identities);
    const vision = uniquePassports([...visionFirst.identities, ...visionMore.identities]);
    const mrzText = [visionFirst.mrzText, visionMore.mrzText].filter(Boolean).join("\n") || null;
    const mrz = uniquePassports([
      ...pdfMrz,
      ...(mrzText ? parseMrzFromOcrAll(mrzText) : []),
    ]);
    const identities = mergePassportSets(mrz, vision);

    if (!identities.length) {
      return scanResult(
        [],
        isPdf
          ? "PDF lu, mais l’identité n’est pas assez nette. Essayez une photo JPEG de la page d’identité."
          : "Zone illisible. Cadrez le bas du passeport ou de la carte (bande de caractères) et réessayez."
      );
    }

    const weak = identities.some((identity) => fieldScore(identity) < 4);
    return scanResult(
      identities,
      weak ? "Lecture partielle : vérifiez chaque passeport avant d’enregistrer." : null
    );
  } catch (err) {
    if (pdfMrz.length) {
      return scanResult(
        pdfMrz,
        "Lecture partielle depuis le PDF : vérifiez chaque champ avant d’enregistrer."
      );
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
