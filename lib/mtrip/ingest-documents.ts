import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyzeImageBuffer,
  analyzePdfBuffer,
  mergeExtractions,
} from "@/lib/mtrip/extract-pdf";
import type {
  AgencyMtripGuide,
  MtripGuideDocument,
  MtripGuideExtraction,
  QuoteLine,
} from "@/lib/mtrip/guide-types";
import {
  ingestFileSize,
  sanitizeStorageName,
  type IngestFile,
} from "@/lib/mtrip/ingest-types";
import {
  inferTripDates,
  quoteLinesFromExtraction,
} from "@/lib/mtrip/quote-lines";
import { buildVoyageTitle } from "@/lib/mtrip/voyage-title";

export type IngestDocumentFileError = {
  file: string;
  message: string;
};

export type IngestDocumentsResult = {
  guide: AgencyMtripGuide;
  added: number;
  errors: IngestDocumentFileError[];
};

const DOC_MAX_BYTES = 20 * 1024 * 1024;

export function isPdfIngestFile(file: IngestFile) {
  const nameLower = file.name.toLowerCase();
  return file.type.includes("pdf") || nameLower.endsWith(".pdf");
}

export function isImageIngestFile(file: IngestFile) {
  const nameLower = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|heic|gif)$/i.test(nameLower)
  );
}

export async function ingestDocumentFiles(opts: {
  supabase: SupabaseClient;
  userId: string;
  guide: AgencyMtripGuide;
  files: IngestFile[];
  strict?: boolean;
}): Promise<IngestDocumentsResult> {
  const { supabase, userId, files, strict } = opts;
  const id = opts.guide.id;
  const documents = [...(opts.guide.documents || [])];
  let extraction = {
    ...((opts.guide.extraction || {}) as MtripGuideExtraction),
  };
  let quoteLines: QuoteLine[] = [...(opts.guide.quote_lines || [])];
  const errors: IngestDocumentFileError[] = [];
  let added = 0;

  for (const file of files) {
    const isPdf = isPdfIngestFile(file);
    const isImage = isImageIngestFile(file);
    if (!isPdf && !isImage) {
      const message = `Format non supporté (PDF ou image) : ${file.name}`;
      if (strict) throw new Error(message);
      errors.push({ file: file.name, message });
      continue;
    }
    const size = ingestFileSize(file);
    if (size > DOC_MAX_BYTES) {
      const message = `Fichier trop volumineux: ${file.name}`;
      if (strict) throw new Error(message);
      errors.push({ file: file.name, message });
      continue;
    }

    const docId = crypto.randomUUID();
    const storagePath = `${userId}/${id}/${docId}-${sanitizeStorageName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("agency-mtrip")
      .upload(storagePath, file.buffer, {
        contentType: file.type || (isPdf ? "application/pdf" : "image/png"),
        upsert: false,
      });
    if (uploadError) {
      if (strict) throw new Error(uploadError.message);
      errors.push({ file: file.name, message: uploadError.message });
      continue;
    }

    let kind: MtripGuideDocument["kind"] = "unknown";
    let analyzedExtraction: Partial<MtripGuideExtraction> = {
      flights: [],
      hotels: [],
      notes: [],
      raw_texts: [],
    };
    let fullText = "";
    let contentTitle: string | null = null;

    try {
      const analyzed = isPdf
        ? await analyzePdfBuffer(file.buffer, file.name, docId)
        : await analyzeImageBuffer(file.buffer, file.name, docId);
      kind = analyzed.kind;
      analyzedExtraction = analyzed.extraction;
      fullText = analyzed.text || "";
      contentTitle = analyzed.title || null;
      extraction = mergeExtractions(extraction, analyzed.extraction);
    } catch (err) {
      extraction = mergeExtractions(extraction, {
        notes: [
          `Extraction partielle pour ${file.name}: ${
            err instanceof Error ? err.message : "erreur"
          }`,
        ],
      });
    }

    const beforeCount = quoteLines.length;
    quoteLines = quoteLinesFromExtraction(
      {
        flights: analyzedExtraction.flights || [],
        hotels: analyzedExtraction.hotels || [],
        notes: analyzedExtraction.notes || [],
        raw_texts: analyzedExtraction.raw_texts || [],
      },
      docId,
      file.name,
      quoteLines,
      fullText
    );

    if (quoteLines.length === beforeCount) {
      quoteLines = [
        ...quoteLines,
        {
          id: crypto.randomUUID(),
          kind: kind === "unknown" ? "other" : kind,
          title: contentTitle || "Confirmation de réservation",
          confirmation: null,
          start_date: null,
          end_date: null,
          amount: null,
          currency: "EUR",
          document_id: docId,
          source_file: file.name,
        },
      ];
    } else if (contentTitle) {
      const last = quoteLines[quoteLines.length - 1];
      const generic =
        !last.title?.trim() ||
        /capture\s*d['’]?\s*e[́e]?cran|screenshot|confirmation \(image\)/i.test(
          last.title
        ) ||
        last.title === file.name.replace(/\.[^.]+$/, "");
      if (generic) {
        quoteLines[quoteLines.length - 1] = {
          ...last,
          title: contentTitle,
          kind: last.kind === "other" && kind !== "unknown" ? kind : last.kind,
        };
      }
    }

    documents.push({
      id: docId,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || (isPdf ? "application/pdf" : "image/png"),
      size,
      kind,
      uploaded_at: new Date().toISOString(),
    });
    added += 1;
  }

  const dates = inferTripDates(quoteLines);
  const start_date = dates.start_date || opts.guide.start_date;
  const end_date = dates.end_date || opts.guide.end_date;
  const title = buildVoyageTitle({
    start_date,
    end_date,
    quote_lines: quoteLines,
    extraction,
    currentTitle: opts.guide.title,
  });

  const status =
    opts.guide.passengers?.length && documents.length ? "ready" : "draft";

  const { data: updated, error: updateError } = await supabase
    .from("agency_mtrip_guides")
    .update({
      documents,
      extraction,
      quote_lines: quoteLines,
      title,
      start_date,
      end_date,
      status,
      payload: null,
      app_links: {},
      published_at: null,
      mtrip_trip_id: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message || "Mise à jour du voyage impossible");
  }

  return { guide: updated as AgencyMtripGuide, added, errors };
}
