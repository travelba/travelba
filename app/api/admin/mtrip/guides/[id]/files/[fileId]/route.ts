import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; fileId: string }> };

/**
 * URL signée courte pour prévisualiser un fichier du dossier voyage
 * (confirmation ou passeport) dans le CRM.
 */
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id, fileId } = await params;

  const { data: guide, error } = await supabase
    .from("agency_mtrip_guides")
    .select("id,documents,passport_files")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!guide) return jsonError("Voyage introuvable", 404);

  const g = guide as Pick<
    AgencyMtripGuide,
    "documents" | "passport_files"
  >;

  const doc =
    (g.documents || []).find((d) => d.id === fileId) ||
    (g.passport_files || []).find((d) => d.id === fileId);

  if (!doc?.storage_path) {
    return jsonError("Fichier introuvable dans ce dossier", 404);
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("agency-mtrip")
    .createSignedUrl(doc.storage_path, 60 * 30);

  if (signError || !signed?.signedUrl) {
    return jsonError(
      signError?.message || "Impossible de générer l’aperçu",
      500
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    file_name: doc.file_name,
    mime_type: doc.mime_type,
    size: doc.size,
    kind: "kind" in doc ? doc.kind : "passport",
  });
}

/**
 * Supprime une PJ (confirmation ou passeport) : Storage + métadonnées du dossier.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id, fileId } = await params;

  const { data: guide, error } = await supabase
    .from("agency_mtrip_guides")
    .select(
      "id,documents,passport_files,passengers,quote_lines,extraction"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!guide) return jsonError("Voyage introuvable", 404);

  const g = guide as Pick<
    AgencyMtripGuide,
    | "documents"
    | "passport_files"
    | "passengers"
    | "quote_lines"
    | "extraction"
  >;

  const inDocs = (g.documents || []).some((d) => d.id === fileId);
  const inPassports = (g.passport_files || []).some((d) => d.id === fileId);
  const doc =
    (g.documents || []).find((d) => d.id === fileId) ||
    (g.passport_files || []).find((d) => d.id === fileId);

  if (!doc?.storage_path) {
    return jsonError("Fichier introuvable dans ce dossier", 404);
  }

  const { error: removeError } = await supabase.storage
    .from("agency-mtrip")
    .remove([doc.storage_path]);

  if (removeError) {
    // Fichier déjà absent du bucket : on continue le nettoyage JSON
    console.warn("[files/DELETE] storage remove:", removeError.message);
  }

  const documents = inDocs
    ? (g.documents || []).filter((d) => d.id !== fileId)
    : g.documents || [];
  const passport_files = inPassports
    ? (g.passport_files || []).filter((d) => d.id !== fileId)
    : g.passport_files || [];

  const passengers = (g.passengers || []).map((p) => {
    const linkedById =
      inPassports &&
      (g.passport_files || []).find((f) => f.id === fileId)?.passenger_id ===
        p.id;
    const linkedByPath = p.attachment_path === doc.storage_path;
    if (!linkedById && !linkedByPath) return p;
    return {
      ...p,
      attachment_path: null,
      source_file:
        linkedByPath || linkedById
          ? p.source_file && p.source_file === doc.file_name
            ? null
            : p.source_file
          : p.source_file,
    };
  });

  const quote_lines = (g.quote_lines || []).map((line) =>
    line.document_id === fileId ? { ...line, document_id: null } : line
  );

  const extraction = g.extraction
    ? {
        ...g.extraction,
        raw_texts: (g.extraction.raw_texts || []).filter(
          (r) => r.document_id !== fileId
        ),
      }
    : g.extraction;

  const { data: updated, error: updateError } = await supabase
    .from("agency_mtrip_guides")
    .update({
      documents,
      passport_files,
      passengers,
      quote_lines,
      extraction,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (updateError) return jsonError(updateError.message, 500);

  return NextResponse.json({
    ok: true,
    guide: updated as AgencyMtripGuide,
  });
}
