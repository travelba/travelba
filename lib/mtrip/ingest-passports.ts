import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgencyMtripGuide,
  MtripGuidePassenger,
  PassportFileAttachment,
} from "@/lib/mtrip/guide-types";
import type { PassportParseResult } from "@/lib/mtrip/extract-passport";
import { parsePassportFile } from "@/lib/mtrip/extract-passport";
import { mergeImportedPassengers } from "@/lib/mtrip/passenger-merge";
import { passengerCompleteness } from "@/lib/mtrip/passenger-schema";
import {
  ingestFileSize,
  sanitizeStorageName,
  type IngestFile,
} from "@/lib/mtrip/ingest-types";

export type IngestPassportFile = IngestFile & {
  parsed?: PassportParseResult;
};

export type PassportImportFileResult = {
  file: string;
  status: "added" | "updated" | "failed" | "skipped";
  message?: string;
  passenger_name?: string;
};

export type IngestPassportsResult = {
  passengers: MtripGuidePassenger[];
  passport_files: PassportFileAttachment[];
  guide: AgencyMtripGuide | null;
  added: number;
  updated: number;
  warnings: string[];
  results: PassportImportFileResult[];
  summary: string;
};

const PASSPORT_MAX_BYTES = 25 * 1024 * 1024;

function isAllowedPassportFile(file: IngestFile) {
  const ext = file.name.toLowerCase();
  return (
    file.type.includes("pdf") ||
    file.type.startsWith("image/") ||
    /\.(pdf|jpe?g|png|webp|gif|heic|heif)$/i.test(ext)
  );
}

export async function ingestPassportFiles(opts: {
  supabase: SupabaseClient;
  userId: string;
  guide: AgencyMtripGuide | null;
  files: IngestPassportFile[];
  existing?: MtripGuidePassenger[];
}): Promise<IngestPassportsResult> {
  const { supabase, userId, files } = opts;
  const guideId = opts.guide?.id || null;

  let existing: MtripGuidePassenger[] = [];
  if (opts.existing?.length) {
    existing = opts.existing;
  } else if (opts.guide?.passengers?.length) {
    existing = opts.guide.passengers;
  }

  const fileResults: PassportImportFileResult[] = [];
  const warnings: string[] = [];
  let current = existing.map((p) => ({ ...p }));
  let totalAdded = 0;
  let totalUpdated = 0;
  const passportFiles: PassportFileAttachment[] = [
    ...((opts.guide?.passport_files || []) as PassportFileAttachment[]),
  ];

  for (const file of files) {
    const size = ingestFileSize(file);
    if (size > PASSPORT_MAX_BYTES) {
      fileResults.push({
        file: file.name,
        status: "failed",
        message: "Fichier trop volumineux (max 25 Mo)",
      });
      continue;
    }

    if (!isAllowedPassportFile(file)) {
      fileResults.push({
        file: file.name,
        status: "failed",
        message: "Format non supporté — PDF, JPG, PNG, WEBP",
      });
      continue;
    }

    try {
      const result =
        file.parsed ||
        (await parsePassportFile(file.buffer, file.name, file.type));
      warnings.push(...result.warnings);

      let attachmentPath: string | null = null;
      if (guideId) {
        const attId = crypto.randomUUID();
        const storagePath = `${userId}/${guideId}/passports/${attId}-${sanitizeStorageName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("agency-mtrip")
          .upload(storagePath, file.buffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (uploadError) {
          warnings.push(`${file.name}: PJ non stockée (${uploadError.message})`);
        } else {
          attachmentPath = storagePath;
          passportFiles.push({
            id: attId,
            file_name: file.name,
            storage_path: storagePath,
            mime_type: file.type || "application/octet-stream",
            size,
            uploaded_at: new Date().toISOString(),
          });
        }
      }

      if (!result.passengers.length) {
        fileResults.push({
          file: file.name,
          status: "failed",
          message:
            result.warnings.find((w) => w.startsWith(file.name)) ||
            result.warnings[result.warnings.length - 1] ||
            "Aucun passager extrait",
        });
        continue;
      }

      const drafts = result.passengers.map((p) => {
        const { complete } = passengerCompleteness(p);
        return {
          ...p,
          source_file: p.source_file || file.name,
          attachment_path: attachmentPath,
          import_status: complete ? ("complete" as const) : ("review" as const),
          import_warnings: result.warnings.filter((w) => w.includes(file.name)),
        };
      });

      const beforeLen = current.length;
      const merged = mergeImportedPassengers(current, drafts);
      current = merged.passengers;
      totalAdded += merged.added;
      totalUpdated += merged.updated;

      if (attachmentPath) {
        const last = passportFiles[passportFiles.length - 1];
        const match = current.find(
          (p) =>
            p.source_file === file.name ||
            (drafts[0].passport_number &&
              p.passport_number === drafts[0].passport_number)
        );
        if (last && match) last.passenger_id = match.id;
      }

      const names = drafts
        .map((p) => `${p.first_name} ${p.last_name}`.trim())
        .filter(Boolean)
        .join(", ");

      if (merged.added > 0) {
        fileResults.push({
          file: file.name,
          status: "added",
          passenger_name: names,
          message:
            drafts.length > 1
              ? `${drafts.length} passeports importés${
                  result.status === "partial" ? " — vérifier les champs" : ""
                }`
              : result.status === "partial"
                ? "Importé — vérifiez les champs manquants"
                : "Importé",
        });
      } else if (merged.updated > 0 || current.length === beforeLen) {
        fileResults.push({
          file: file.name,
          status: "updated",
          passenger_name: names,
          message:
            drafts.length > 1
              ? `${drafts.length} passagers déjà présents — données complétées`
              : "Passager déjà présent — données complétées",
        });
      } else {
        fileResults.push({
          file: file.name,
          status: "skipped",
          passenger_name: names,
          message: "Doublon ignoré",
        });
      }
    } catch (err) {
      fileResults.push({
        file: file.name,
        status: "failed",
        message: err instanceof Error ? err.message : "Erreur inattendue",
      });
    }
  }

  const hasLead = current.some((p) => p.role === "lead_traveler");
  current = current.map((p, index) => ({
    ...p,
    role: hasLead
      ? p.role === "lead_traveler"
        ? ("lead_traveler" as const)
        : ("traveler" as const)
      : index === 0
        ? ("lead_traveler" as const)
        : ("traveler" as const),
  }));

  let guide = opts.guide;
  if (guideId && guide) {
    const { data: updated, error: updateError } = await supabase
      .from("agency_mtrip_guides")
      .update({
        passengers: current,
        passport_files: passportFiles,
        status: "ready",
        payload: null,
        app_links: {},
        published_at: null,
        mtrip_trip_id: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", guideId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    guide = updated as AgencyMtripGuide;
  }

  const failed = fileResults.filter((r) => r.status === "failed");
  const succeeded = fileResults.filter((r) => r.status !== "failed");

  return {
    passengers: current,
    passport_files: passportFiles,
    guide,
    added: totalAdded,
    updated: totalUpdated,
    warnings,
    results: fileResults,
    summary:
      succeeded.length === 0
        ? "Aucun passeport importé — les passagers existants sont conservés."
        : `${succeeded.length} fichier(s) traité(s) · ${totalAdded} ajouté(s) · ${totalUpdated} complété(s)${failed.length ? ` · ${failed.length} échec(s)` : ""}`,
  };
}
