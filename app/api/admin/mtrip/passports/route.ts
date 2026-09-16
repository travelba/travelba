import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { ingestPassportFiles } from "@/lib/mtrip/ingest-passports";
import type {
  AgencyMtripGuide,
  MtripGuidePassenger,
} from "@/lib/mtrip/guide-types";
import {
  markGuidePublicationInvalidated,
  removePublishedMtripBeforeEdit,
} from "@/lib/mtrip/invalidate-publication";

export const runtime = "nodejs";
export const maxDuration = 300;

export type { PassportImportFileResult } from "@/lib/mtrip/ingest-passports";

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const form = await request.formData();
  const formFiles = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!formFiles.length) return jsonError("Aucun fichier passeport");

  const guideId =
    typeof form.get("guide_id") === "string"
      ? String(form.get("guide_id"))
      : null;

  let guide: AgencyMtripGuide | null = null;
  if (guideId) {
    const { data, error } = await supabase
      .from("agency_mtrip_guides")
      .select("*")
      .eq("id", guideId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!data) return jsonError("Voyage introuvable", 404);
    guide = data as AgencyMtripGuide;
  }

  let existing: MtripGuidePassenger[] | undefined;
  const existingRaw = form.get("existing");
  if (typeof existingRaw === "string" && existingRaw.trim()) {
    try {
      const parsed = JSON.parse(existingRaw) as MtripGuidePassenger[];
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      // ignore
    }
  }

  const files = await Promise.all(
    formFiles.map(async (file) => ({
      name: file.name,
      type: file.type,
      buffer: await file.arrayBuffer(),
      size: file.size,
    }))
  );

  try {
    if (guide && guideId) {
      const removed = await removePublishedMtripBeforeEdit(guide);
      if (removed) {
        await markGuidePublicationInvalidated(supabase, user.id, guideId);
      }
    }
    const result = await ingestPassportFiles({
      supabase,
      userId: user.id,
      guide,
      files,
      existing,
    });
    const failed = result.results.filter((r) => r.status === "failed");
    return NextResponse.json({
      passengers: result.passengers,
      guide: result.guide,
      passport_files: result.passport_files,
      added: result.added,
      updated: result.updated,
      failed: failed.map((f) => ({ file: f.file, message: f.message || "" })),
      warnings: result.warnings,
      results: result.results,
      summary: result.summary,
    });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Import passeports impossible",
      500
    );
  }
}
