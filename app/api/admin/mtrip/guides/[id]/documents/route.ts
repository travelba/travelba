import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { ingestDocumentFiles } from "@/lib/mtrip/ingest-documents";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await params;

  const { data: guide, error } = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!guide) return jsonError("Voyage introuvable", 404);

  const form = await request.formData();
  const formFiles = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!formFiles.length) return jsonError("Aucun fichier");

  const files = await Promise.all(
    formFiles.map(async (file) => ({
      name: file.name,
      type: file.type,
      buffer: await file.arrayBuffer(),
      size: file.size,
    }))
  );

  try {
    const result = await ingestDocumentFiles({
      supabase,
      userId: user.id,
      guide: guide as AgencyMtripGuide,
      files,
      strict: true,
    });
    return NextResponse.json({ guide: result.guide });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Import documents impossible"
    );
  }
}
