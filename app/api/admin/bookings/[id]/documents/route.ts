import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { queuePublishedPieces, safeConcierge } from "@/lib/crm/concierge-send";
import { normalizePieceKind } from "@/lib/crm/concierge-notices";
import { removeCrmFiles, safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { uploadIssue } from "@/lib/crm/upload-policy";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Fichier requis");
  const issue = uploadIssue(file, "dossier");
  if (issue) return jsonError(issue, 400);
  const kind = String(form.get("kind") || "other");
  // La carte est vérifiée avant le téléversement : pas de fichier orphelin sur « Carte introuvable ».
  const itemId = String(form.get("booking_item_id") || "").trim() || null;
  if (itemId) {
    const { data: item } = await auth.supabase
      .from("crm_booking_items")
      .select("id")
      .eq("id", itemId)
      .eq("booking_id", id)
      .maybeSingle();
    if (!item) return jsonError("Carte introuvable", 404);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `bookings/${id}/${Date.now()}-${safeFileName(file.name)}`;
  await uploadCrmFile(path, bytes, file.type || "application/octet-stream");
  const { data, error } = await auth.supabase
    .from("crm_booking_documents")
    .insert({
      booking_id: id,
      booking_item_id: itemId,
      kind,
      file_name: file.name,
      mime_type: file.type,
      storage_path: path,
      visible_to_client: false,
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
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
  if (error) return dbError(error, 400);
  const doc = data as { id: string; kind: string; booking_item_id?: string | null; visible_to_client?: boolean };
  if (doc.visible_to_client) {
    const { data: booking } = await auth.supabase
      .from("crm_bookings")
      .select("visible_to_client")
      .eq("id", id)
      .maybeSingle();
    if (booking?.visible_to_client) {
      let itemKind: string | null = null;
      if (doc.booking_item_id) {
        const { data: item } = await auth.supabase
          .from("crm_booking_items")
          .select("kind")
          .eq("id", doc.booking_item_id)
          .maybeSingle();
        itemKind = (item?.kind as string | undefined) || null;
      }
      const kind = normalizePieceKind(itemKind) || normalizePieceKind(doc.kind);
      if (kind) await safeConcierge(() => queuePublishedPieces(id, [{ id: doc.id, kind }]));
    }
  }
  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const docId = new URL(request.url).searchParams.get("id") || "";
  if (!docId) return jsonError("id requis");
  const { data: doc, error: readError } = await auth.supabase
    .from("crm_booking_documents")
    .select("id, storage_path")
    .eq("id", docId)
    .eq("booking_id", id)
    .maybeSingle();
  if (readError) return dbError(readError, 400);
  if (!doc) return jsonError("Pièce introuvable", 404);
  const { error } = await auth.supabase
    .from("crm_booking_documents")
    .delete()
    .eq("id", docId)
    .eq("booking_id", id);
  if (error) return dbError(error, 400);
  if (doc.storage_path) await removeCrmFiles([doc.storage_path]);
  return NextResponse.json({ ok: true });
}
