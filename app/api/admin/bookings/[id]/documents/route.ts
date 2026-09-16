import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import {
  deleteCrmFile,
  safeFileName,
  uploadCrmFile,
  validateCrmFile,
  validateCrmFileMetadata,
} from "@/lib/crm/files";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Fichier requis");
  const kind = String(form.get("kind") || "other");
  const visible = String(form.get("visible_to_client") || "") === "true";
  const metadataError = validateCrmFileMetadata(file);
  if (metadataError) return jsonError(metadataError, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const validationError = validateCrmFile(file, bytes);
  if (validationError) return jsonError(validationError, 400);
  const path = `bookings/${id}/${Date.now()}-${safeFileName(file.name)}`;
  await uploadCrmFile(path, bytes, file.type || "application/octet-stream");
  const { data, error } = await auth.supabase
    .from("crm_booking_documents")
    .insert({
      booking_id: id,
      kind,
      file_name: file.name,
      mime_type: file.type,
      storage_path: path,
      visible_to_client: visible,
    })
    .select("*")
    .single();
  if (error) {
    await deleteCrmFile(path).catch(() => undefined);
    return jsonError(error.message, 400);
  }
  return NextResponse.json({ document: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const docId = String(body?.id || "");
  if (!docId) return jsonError("id requis");
  const { data, error } = await auth.supabase
    .from("crm_booking_documents")
    .update({ visible_to_client: Boolean(body?.visible_to_client) })
    .eq("id", docId)
    .eq("booking_id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const docId = new URL(request.url).searchParams.get("documentId");
  if (!docId) return jsonError("documentId requis");

  const { data: document } = await auth.supabase
    .from("crm_booking_documents")
    .select("storage_path")
    .eq("id", docId)
    .eq("booking_id", id)
    .maybeSingle();
  if (!document) return jsonError("Document introuvable", 404);

  const { error } = await auth.supabase
    .from("crm_booking_documents")
    .delete()
    .eq("id", docId)
    .eq("booking_id", id);
  if (error) return jsonError(error.message, 400);
  if (document.storage_path) {
    await deleteCrmFile(document.storage_path).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
