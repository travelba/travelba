import "server-only";
import { generateText, Output, APICallError } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  extractImages,
  extractText,
  getDocumentProxy,
  renderPageAsImage,
} from "unpdf";
import { trySharp } from "@/lib/crm/sharp";
import { openPdf } from "@/lib/crm/pdf-raster";
import { downloadCrmFile } from "@/lib/crm/files";
import {
  applyStructuredHints,
  classifyIngestFamily,
  parsedItemsFromText,
  parserItemsComplete,
  shouldUseVision,
  structuredHintFromPdfText,
  tagSourceFileName,
  type IngestFamily,
} from "@/lib/crm/ingest-parse";
import { mergeFileExtracts, type FileExtractResult } from "@/lib/crm/ingest-merge";
import { redactIngestText } from "@/lib/crm/ingest-redact";
import {
  aiGatewayConfigured,
  bookingExtractLlmSchema,
  emptyBookingExtract,
  guessIngestMime,
  openaiApiKey,
  sanitizeExtractedPrices,
  type BookingExtract,
  type IngestStreamEvent,
  type IngestWarning,
} from "@/lib/crm/ingest-types";

const LLM_TEXT_SLICE = 40000;
const LLM_CONCURRENCY = 3;
const MAX_RASTER_PAGES = 5;
const MAX_NATIVE_PDF_BYTES = 8 * 1024 * 1024;

const PROMPT_COMMON = `Tu es l’assistant d’une agence de voyage française (Travel Business Agency).
Un dépôt = UN séjour. Si plusieurs voyages : extraire le plus complet et le dire dans notes_client.

document_status : confirmed | quote | identity.
- quote = « none are on hold », plusieurs options tarifaires, pas de nom de réservation.
- identity = passeport → ne pas créer de prestation.

Règles d’honnêteté :
- Ne jamais inventer. Absent = null. Pas de check-in 15:00 / check-out 12:00.
- Ne jamais extraire de PAN / CVC, même masqué.
- Ne pas extraire conditions d’annulation, net fournisseur, franchise, CGV.
- Inclus (petit-déj, spa, taxes) UNIQUEMENT si une phrase l’écrit. Sinon included = [].
- Traduire en français les libellés de chambre / inclus. Garder les noms propres.
- Horaires ISO 8601 seulement s’ils sont imprimés (heures locales du lieu).
- Devise : $ = USD, € = EUR, CHF = CHF.
- kind : flight | hotel | transfer | activity | rail | car | cruise | insurance | fee.
- Un PDF peut produire PLUSIEURS cartes.
- details.source_file_name = nom exact du fichier source.
- details.needs_review = true si lecture douteuse.
- amount des items : toujours null (pas le net client).
- details.document_amount = montant imprimé sur CE fichier (total visible). Absent = null. Pas une ligne « NET » fournisseur seule.
- total_amount : somme des details.document_amount (un montant par fichier). L’agent peut corriger le prix vendu.
- details.document_currency = EUR | USD | CHF | GBP selon le symbole / code imprimé.

Voyageurs :
- Noms imprimés, casse normale.
- Si « 2 adults » sans noms : travelers = [{first_name:"Adulte", last_name:"1"}, {first_name:"Adulte", last_name:"2"}].
- Si des noms sont imprimés, ne pas ajouter de voyageurs « Adulte N ».
- Ne pas créer d’enfant sans nom.

title : villes séparées par « · ». destination : mêmes villes.`;

const PROMPT_FLIGHT = `Vol :
- Aller et retour = DEUX items si les deux sont imprimés (même PDF). Correspondance = DEUX items. Pas de retour fantôme.
- Plusieurs e-tickets passagers pour le MÊME vol (même n°, même jour) = UN item. Les noms vont dans travelers. Le nombre de billets est compté à la fusion (details.ticket_count). L’agent saisit un prix unitaire par billet.
- confirmation_ref = PNR GDS 6 lettres. details.pnr = réf. compagnie. Jamais l’IATA 8 chiffres agence (20287864, 20255270, 96020293, 20289905).
- details.airline = transporteur opérant. supplier = émetteur du billet (Hahn Air ≠ Air Panama ; Copa opérant = Copa).
- details.from / to = IATA. Souvent absent du PDF : Gelabert/Albrook=PAC, Isla Colón=BOC, Enrique Malek=DAV, Tocumen=PTY, Charles-de-Gaulle=CDG, Genève=GVA, Heathrow=LHR, Marseille Provence=MRS.
- details.city_from / city_to = villes. « 03 August 09:45 » : année = ligne « Lundi 03 août 2026 ».
- Terminal / siège seulement s’ils sont imprimés. « Heure limite d’enregistrement » n’est pas l’horaire du vol.
- Carte fidélité : ne pas extraire.
- « Scan for check-in. Not to be used as boarding pass » n’est PAS un hôtel.
- Vol de nuit : start_at = décollage ; noter J+1 dans details.notes si l’arrivée est le lendemain.`;

const PROMPT_HOTEL = `Hôtel :
- UN item même s’il y a deux chambres / deux réf. : details.rooms = [{room, guests, confirmation_ref}, …].
- confirmation_ref = première réf. ou les deux séparées par « ; » (ex. 97620170;97620172).
- title de la carte = details.hotel_name (nom de l’établissement), PAS la ville. details.city = ville. details.address, details.board si écrite.
- Nantipa / vouchers Costa Rica : 08/02/2026 = 2 août (MM/JJ), pas 8 février. Check-in 15:00 dans les CGV ≠ heure de la carte (date only).
- Confirmation type The Leela : Check In 14-SEP-26 = date only. Ignorer 14:00/12:00 de politique et Pick Up / Drop Off 00:00. TENTATIVE → details.needs_review.
- Devis Passion Collection / « none are on hold » : document_status=quote, un item hôtel, rooms = les options. Pas de NET.`;

const PROMPT_OTHER = `Toucan Discovery = activités (kind=activity). Les « étapes » du cadre ne sont PAS des réservations hôtel.
Transfert : details.pickup / dropoff. Si « 2 h 30 avant le vol » sans heure clock → details.pickup_note, pas d’heure inventée.
Train (rail) : comme un vol (n°, gares, horaires si écrits).
Voiture (SIXT / loueur) : kind=car. confirmation_ref = n° de réservation. start_at / end_at = prise et restitution. details.pickup / dropoff / vehicle. Pas de franchise, caution, TTC, protection.
Bateau (cruise) : une carte pour la traversée, pas un jour par port.`;

const PROMPT_MAEVA = `Confirmation maeva.com / Pierre & Vacances :
- UN hôtel (résidence). title = details.hotel_name (établissement), PAS la ville. details.city = station.
- Arrivée / départ en date only. Pas d’horaire inventé (15:00 / 12:00).
- confirmation_ref = N° de dossier, UNIQUEMENT sur la carte hôtel. Les extras n’ont pas cette réf.
- VOS OPTIONS = cartes séparées : forfaits (activity), matériel de ski (activity), cours (activity), assurance (insurance).
- Lignes d’un même total → details.included (ex. « 1 × Adulte 26–64 ans »). details.duration si « 6 jours consécutifs » est écrit.
- Ignorer totaux à 0 €, frais de dossier, CGV, cagnotte, PAN, n° de transaction bancaire.
- E-mail agence ≠ customer_email. Pas d’enfants sans nom.
- amount des items = null. details.document_amount = total TTC du dossier, une seule fois.`;

const FAMILY_PROMPT: Record<IngestFamily, string> = {
  amadeus: PROMPT_FLIGHT,
  little_emperors: PROMPT_HOTEL,
  nantipa: PROMPT_HOTEL,
  hotel_letter: PROMPT_HOTEL,
  quote: `${PROMPT_HOTEL}\nCe fichier est un devis.`,
  sixt: PROMPT_OTHER,
  transfer: PROMPT_OTHER,
  toucan: PROMPT_OTHER,
  maeva: `${PROMPT_HOTEL}\n${PROMPT_MAEVA}`,
  identity: "C’est une pièce d’identité. document_status=identity. Aucun item de réservation.",
  unknown: `${PROMPT_FLIGHT}\n${PROMPT_HOTEL}\n${PROMPT_OTHER}\n${PROMPT_MAEVA}`,
};

type UserPart =
  | { type: "text"; text: string }
  | { type: "image"; image: Uint8Array; mediaType: string }
  | { type: "file"; data: Uint8Array; mediaType: string; filename?: string };

export type PreparedIngestFile = {
  name: string;
  type?: string | null;
  bytes?: Uint8Array;
  path?: string;
};

function ingestModel() {
  const key = openaiApiKey();
  if (key) return createOpenAI({ apiKey: key })("gpt-4o");
  return "openai/gpt-4o";
}

function isRetryableLlmError(err: unknown) {
  if (APICallError.isInstance(err)) {
    const status = err.statusCode;
    if (status === 401 || status === 403 || status === 408 || status === 429) {
      return true;
    }
    if (status != null && status >= 500) return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /timeout|ECONNRESET|429|temporar|rate limit/i.test(message);
}

async function generateExtract(content: UserPart[], useGateway: boolean) {
  return generateText({
    model: useGateway ? "openai/gpt-4o" : ingestModel(),
    output: Output.object({
      schema: bookingExtractLlmSchema,
      name: "booking",
      description: "Dossier de réservation extrait des documents",
    }),
    messages: [{ role: "user", content }],
    ...(useGateway
      ? {
          providerOptions: {
            gateway: {
              tags: ["feature:booking-ingest"],
              models: ["google/gemini-2.5-flash"],
            },
          },
        }
      : {}),
  });
}

async function imagePart(bytes: Uint8Array, mediaType: string): Promise<UserPart> {
  if (mediaType.includes("heic") || mediaType.includes("heif")) {
    const sharp = await trySharp();
    if (sharp) {
      try {
        const jpeg = await sharp(Buffer.from(bytes)).jpeg({ quality: 85 }).toBuffer();
        return { type: "image", image: new Uint8Array(jpeg), mediaType: "image/jpeg" };
      } catch {
        /* keep original */
      }
    }
  }
  return { type: "image", image: bytes, mediaType };
}

async function jpegFromRaw(
  data: Uint8Array,
  raw?: { width: number; height: number; channels: 1 | 3 | 4 }
): Promise<UserPart | null> {
  const sharp = await trySharp();
  if (!sharp) {
    return {
      type: "image",
      image: data,
      mediaType: raw ? "image/jpeg" : "image/png",
    };
  }
  try {
    const pipeline = raw
      ? sharp(data, { raw: { width: raw.width, height: raw.height, channels: raw.channels } })
      : sharp(data);
    const jpeg = await pipeline
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    return { type: "image", image: new Uint8Array(jpeg), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

async function embeddedPdfImages(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  pageCount: number
): Promise<UserPart[]> {
  const parts: UserPart[] = [];
  const max = Math.min(pageCount, MAX_RASTER_PAGES);
  for (let page = 1; page <= max; page++) {
    const images = await extractImages(pdf, page);
    for (const img of images.slice(0, 4)) {
      const part = await jpegFromRaw(new Uint8Array(img.data), {
        width: img.width,
        height: img.height,
        channels: img.channels,
      });
      if (part) parts.push(part);
    }
  }
  return parts;
}

async function rasterPdfPages(bytes: Uint8Array, pageCount: number): Promise<UserPart[]> {
  const pdf = await openPdf(bytes);
  const parts: UserPart[] = [];
  const max = Math.min(pageCount, MAX_RASTER_PAGES);
  for (let page = 1; page <= max; page++) {
    try {
      const png = await renderPageAsImage(pdf, page, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: 1.4,
      });
      const part = await jpegFromRaw(new Uint8Array(png as ArrayBuffer));
      if (part) parts.push(part);
    } catch {
      /* try embedded images for this page below */
    }
  }
  if (parts.length) return parts;
  return embeddedPdfImages(pdf, pageCount);
}

function familyPrompt(family: IngestFamily, name: string) {
  return `${PROMPT_COMMON}\n\n${FAMILY_PROMPT[family]}\n\nFichier source : « ${name} ». details.source_file_name = ce nom.`;
}

function finalizeExtract(extract: BookingExtract, texts: string[], name: string): BookingExtract {
  const next = sanitizeExtractedPrices(applyStructuredHints(extract, texts));
  return {
    ...next,
    items: tagSourceFileName(next.items || [], name),
  };
}

async function llmExtract(opts: {
  name: string;
  family: IngestFamily;
  content: UserPart[];
  texts: string[];
  pdfBytes?: Uint8Array;
  sparse: boolean;
}): Promise<BookingExtract> {
  const key = openaiApiKey();
  const run = async (parts: UserPart[], gateway: boolean) => {
    const result = await generateExtract(parts, gateway);
    if (!result.output) {
      throw new Error("Lecture incomplète. Réessayez avec des fichiers plus lisibles.");
    }
    return finalizeExtract(result.output as BookingExtract, opts.texts, opts.name);
  };

  try {
    const extracted = await run(opts.content, !key);
    const geminiPdf =
      opts.sparse &&
      opts.pdfBytes &&
      opts.pdfBytes.byteLength <= MAX_NATIVE_PDF_BYTES &&
      !extracted.items.length;
    if (geminiPdf) {
      try {
        const gemini = await run(
          [
            { type: "text", text: familyPrompt(opts.family, opts.name) },
            {
              type: "file",
              data: opts.pdfBytes!,
              mediaType: "application/pdf",
              filename: opts.name,
            },
          ],
          true
        );
        if (gemini.items.length) return gemini;
      } catch {
        /* keep first extract */
      }
    }
    return extracted;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Lecture")) throw err;
    if (!key || !isRetryableLlmError(err)) {
      throw new Error("Lecture automatique impossible. Réessayez avec des fichiers plus lisibles.");
    }
    const fallbackParts: UserPart[] =
      opts.sparse && opts.pdfBytes && opts.pdfBytes.byteLength <= MAX_NATIVE_PDF_BYTES
        ? [
            { type: "text", text: familyPrompt(opts.family, opts.name) },
            {
              type: "file",
              data: opts.pdfBytes,
              mediaType: "application/pdf",
              filename: opts.name,
            },
          ]
        : opts.content;
    try {
      return await run(fallbackParts, true);
    } catch (fallbackErr) {
      if (fallbackErr instanceof Error && fallbackErr.message.startsWith("Lecture")) {
        throw fallbackErr;
      }
      throw new Error("Lecture automatique impossible. Réessayez avec des fichiers plus lisibles.");
    }
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length || 1) }, () =>
    worker()
  );
  await Promise.all(workers);
  return out;
}

function compactForReconcile(extract: BookingExtract) {
  return {
    document_status: extract.document_status,
    title: extract.title,
    destination: extract.destination,
    start_date: extract.start_date,
    end_date: extract.end_date,
    notes_client: extract.notes_client,
    travelers: extract.travelers,
    items: (extract.items || []).map((item) => ({
      kind: item.kind,
      title: item.title,
      confirmation_ref: item.confirmation_ref,
      start_at: item.start_at,
      end_at: item.end_at,
      supplier: item.supplier,
      details: {
        needs_review: item.details?.needs_review,
        source_file_name: item.details?.source_file_name,
        from: item.details?.from,
        to: item.details?.to,
        city_from: item.details?.city_from,
        city_to: item.details?.city_to,
        hotel_name: item.details?.hotel_name,
        city: item.details?.city,
        flight_number: item.details?.flight_number,
        pickup: item.details?.pickup,
        dropoff: item.details?.dropoff,
      },
    })),
  };
}

function shouldReconcile(extract: BookingExtract) {
  if (!extract.items.length) return false;
  if (!extract.title) return true;
  if (extract.items.some((item) => item.details?.needs_review)) return true;
  if (
    !(extract.travelers || []).length &&
    extract.items.some((item) => item.kind === "flight")
  ) {
    return true;
  }
  return false;
}

async function reconcileExtract(extract: BookingExtract): Promise<BookingExtract> {
  if (!aiGatewayConfigured() || !shouldReconcile(extract)) return extract;
  const content: UserPart[] = [
    {
      type: "text",
      text: `${PROMPT_COMMON}

Voici les cartes déjà extraites (JSON compact). Complète UNIQUEMENT les champs vides (title, destination, voyageurs s’ils sont imprimés dans les libellés). Ne jamais inventer d’horaire, d’inclus, de prix, de PNR. Si un champ est douteux : details.needs_review=true. Ne fusionne pas un aller et un retour. Ne change pas source_file_name.`,
    },
    { type: "text", text: JSON.stringify(compactForReconcile(extract)) },
  ];
  try {
    const key = openaiApiKey();
    const result = await generateExtract(content, !key);
    if (!result.output) return extract;
    const next = sanitizeExtractedPrices(result.output as BookingExtract);
    return {
      ...extract,
      title: extract.title || next.title,
      destination: extract.destination || next.destination,
      notes_client: extract.notes_client || next.notes_client,
      travelers: (extract.travelers || []).length ? extract.travelers : next.travelers,
      items: extract.items.map((item, index) => {
        const incoming = next.items[index];
        if (!incoming) return item;
        return {
          ...item,
          title: item.title || incoming.title,
          details: {
            ...(item.details || {}),
            needs_review: item.details?.needs_review || incoming.details?.needs_review,
          },
        };
      }),
    };
  } catch {
    return extract;
  }
}

async function readPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  try {
    const pdf = await openPdf(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    return {
      text: redactIngestText(extracted.text || ""),
      pages: extracted.totalPages || 1,
    };
  } catch {
    return { text: "", pages: 1 };
  }
}

async function loadPreparedBytes(file: PreparedIngestFile) {
  if (file.bytes) return file.bytes;
  if (file.path) {
    const downloaded = await downloadCrmFile(file.path);
    return downloaded.bytes;
  }
  throw new Error("Fichier introuvable");
}

async function processPreparedFile(
  file: PreparedIngestFile,
  signal?: AbortSignal
): Promise<FileExtractResult> {
  if (signal?.aborted) throw new Error("Lecture annulée");
  const name = file.name;
  const mediaType = file.type || guessIngestMime(name);
  const isPdf = mediaType === "application/pdf" || name.toLowerCase().endsWith(".pdf");
  const isImage = !isPdf;
  const bytes = await loadPreparedBytes(file);

  let text = "";
  let pages = 1;
  if (isPdf) {
    const extracted = await readPdfText(bytes);
    text = extracted.text;
    pages = extracted.pages;
  }

  const family = classifyIngestFamily(text, name);
  if (family === "identity") {
    return {
      name,
      family,
      identity: true,
      extract: { ...emptyBookingExtract(), document_status: "identity" },
    };
  }

  const parsed = parsedItemsFromText(text);
  const complete = parserItemsComplete(family, parsed.items);
  if (complete) {
    const extract = sanitizeExtractedPrices({
      ...emptyBookingExtract(),
      document_status: parsed.status || (family === "quote" ? "quote" : "confirmed"),
      notes_client: parsed.notes.join("\n"),
      items: tagSourceFileName(parsed.items, name),
    });
    return { name, family, extract };
  }

  const dense = text.replace(/\s/g, "").length;
  const vision = shouldUseVision({
    denseChars: dense,
    itemCount: parsed.items.length,
    family,
    isImage,
    parserComplete: complete,
  });

  const hint = text ? structuredHintFromPdfText(text) : "";
  const content: UserPart[] = [{ type: "text", text: familyPrompt(family, name) }];
  if (text) {
    content.push({
      type: "text",
      text: `PDF « ${name} » (${pages} page${pages > 1 ? "s" : ""}) :\n${text.slice(0, LLM_TEXT_SLICE)}${
        hint ? `\n\nIndices structurés :\n${hint}` : ""
      }`,
    });
  }
  if (isImage) {
    content.push(await imagePart(bytes, mediaType.startsWith("image/") ? mediaType : "image/jpeg"));
    content.push({
      type: "text",
      text: `Image « ${name} » : billet, voucher ou capture. Ne pas extraire de numéro de carte. « Scan for check-in » n’est pas un hôtel.`,
    });
  } else if (vision) {
    try {
      const images = await rasterPdfPages(bytes, pages);
      content.push(...images);
    } catch {
      /* text only */
    }
  }

  if (!aiGatewayConfigured()) {
    if (parsed.items.length) {
      return {
        name,
        family,
        extract: sanitizeExtractedPrices({
          ...emptyBookingExtract(),
          document_status: parsed.status || (family === "quote" ? "quote" : "confirmed"),
          notes_client: parsed.notes.join("\n"),
          items: tagSourceFileName(parsed.items, name),
        }),
        warning: "Lecture IA indisponible : cartes du parseur uniquement, à relire.",
      };
    }
    return {
      name,
      family,
      extract: emptyBookingExtract(),
      error: "Lecture automatique indisponible ici — carte à saisir à la main.",
    };
  }

  try {
    const extract = await llmExtract({
      name,
      family,
      content,
      texts: text ? [text] : [],
      pdfBytes: isPdf ? bytes : undefined,
      sparse: vision && isPdf,
    });
    return {
      name,
      family,
      extract,
      warning: extract.items.length ? undefined : "Aucune carte extraite — à saisir ou réessayer.",
    };
  } catch (err) {
    if (parsed.items.length) {
      return {
        name,
        family,
        extract: sanitizeExtractedPrices({
          ...emptyBookingExtract(),
          document_status: parsed.status || "confirmed",
          notes_client: parsed.notes.join("\n"),
          items: tagSourceFileName(parsed.items, name),
        }),
        warning: "Lecture IA incomplète : cartes du parseur uniquement, à relire.",
      };
    }
    return {
      name,
      family,
      extract: emptyBookingExtract(),
      error: err instanceof Error ? err.message : "Lecture impossible",
    };
  }
}

export async function extractBookingFromPrepared(
  files: PreparedIngestFile[],
  opts?: {
    onEvent?: (event: IngestStreamEvent) => void;
    signal?: AbortSignal;
  }
): Promise<{ extract: BookingExtract; warnings: IngestWarning[] }> {
  if (!files.length) throw new Error("Ajoutez au moins un PDF ou une photo.");
  const total = files.length;
  const results = await mapPool(files, LLM_CONCURRENCY, async (file, index) => {
    opts?.onEvent?.({
      event: "file",
      index,
      total,
      name: file.name,
      status: "reading",
    });
    opts?.onEvent?.({
      event: "progress",
      done: index,
      total,
      current: file.name,
    });
    try {
      const result = await processPreparedFile(file, opts?.signal);
      const status = result.error ? "error" : result.identity ? "identity" : "ok";
      opts?.onEvent?.({
        event: "file",
        index,
        total,
        name: file.name,
        status,
        family: result.family,
        itemCount: result.extract.items?.length || 0,
        message: result.error || result.warning,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lecture impossible";
      opts?.onEvent?.({
        event: "file",
        index,
        total,
        name: file.name,
        status: "error",
        message,
      });
      return {
        name: file.name,
        family: "unknown" as IngestFamily,
        extract: emptyBookingExtract(),
        error: message,
      };
    }
  });

  const merged = mergeFileExtracts(results);
  if (!merged.extract.items.length && results.every((row) => row.error)) {
    throw new Error("Lecture automatique impossible. Réessayez avec des fichiers plus lisibles.");
  }
  const extract = await reconcileExtract(merged.extract);
  opts?.onEvent?.({
    event: "progress",
    done: total,
    total,
    current: undefined,
  });
  return { extract, warnings: merged.warnings };
}

export async function extractBookingFromFiles(files: File[]): Promise<BookingExtract> {
  const prepared: PreparedIngestFile[] = [];
  for (const file of files) {
    prepared.push({
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }
  const { extract } = await extractBookingFromPrepared(prepared);
  return extract;
}
