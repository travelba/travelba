import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { removeCrmFiles, safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { isUuid } from "@/lib/crm/ids";
import { syncCheckinWithPasses } from "@/lib/crm/online-checkin-db";
import { uploadIssue } from "@/lib/crm/upload-policy";

export type BookingUpload = {
  name: string;
  type: string;
  size: number;
  bytes: Buffer;
};

/** Même libellé que le formulaire Documents du dossier. */
export function bookingDocumentKind(raw: string) {
  const value = raw.replace(/\s+/g, " ").trim().slice(0, 40);
  if (value === "carte d'embarquement" || value === "carte d’embarquement") return "carte d'embarquement";
  return value || "other";
}

/**
 * Dépose une pièce sur le dossier, ou sur une carte si `itemId` est indiqué.
 * Même chemin que POST /api/admin/bookings/[id]/documents.
 */
export async function attachBookingDocument(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    itemId?: string | null;
    kind?: string | null;
    visibleToClient?: boolean;
    file: BookingUpload;
    upload?: (path: string, bytes: Buffer, contentType: string) => Promise<unknown>;
  }
): Promise<{ document: Record<string, unknown> } | { error: string; status: number }> {
  if (!isUuid(input.bookingId)) return { error: "Dossier invalide.", status: 400 };
  const issue = uploadIssue(
    { size: input.file.size, type: input.file.type, name: input.file.name },
    "dossier"
  );
  if (issue) return { error: issue, status: 400 };
  const kind = bookingDocumentKind(String(input.kind || "other"));
  const itemId = String(input.itemId || "").trim() || null;
  if (itemId) {
    if (!isUuid(itemId)) return { error: "Carte introuvable", status: 404 };
    const { data: item } = await supabase
      .from("crm_booking_items")
      .select("id")
      .eq("id", itemId)
      .eq("booking_id", input.bookingId)
      .maybeSingle();
    if (!item) return { error: "Carte introuvable", status: 404 };
  }
  const path = `bookings/${input.bookingId}/${Date.now()}-${safeFileName(input.file.name)}`;
  await (input.upload ?? uploadCrmFile)(path, input.file.bytes, input.file.type || "application/octet-stream");
  const { data, error } = await supabase
    .from("crm_booking_documents")
    .insert({
      booking_id: input.bookingId,
      booking_item_id: itemId,
      kind,
      file_name: input.file.name,
      mime_type: input.file.type,
      storage_path: path,
      visible_to_client: input.visibleToClient === true,
    })
    .select("*")
    .single();
  if (error || !data) return { error: dbErrorMessage(error as DbErrorLike, "Pièce non déposée."), status: 400 };
  if (kind === "carte d'embarquement") await syncCheckinWithPasses(supabase, input.bookingId, "agence");
  return { document: data as Record<string, unknown> };
}

/** Retire une pièce du dossier et son fichier. Même chemin que DELETE …/documents. */
export async function removeBookingDocument(
  supabase: SupabaseClient,
  bookingId: string,
  documentId: string,
  remove: (paths: string[]) => Promise<unknown> = removeCrmFiles
): Promise<{ ok: true } | { error: string; status: number }> {
  if (!isUuid(bookingId)) return { error: "Dossier invalide.", status: 400 };
  if (!isUuid(documentId)) return { error: "Pièce introuvable", status: 404 };
  const { data: doc, error: readError } = await supabase
    .from("crm_booking_documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (readError) return { error: dbErrorMessage(readError as DbErrorLike, "Pièce introuvable"), status: 400 };
  if (!doc) return { error: "Pièce introuvable", status: 404 };
  const { error } = await supabase.from("crm_booking_documents").delete().eq("id", documentId).eq("booking_id", bookingId);
  if (error) return { error: dbErrorMessage(error as DbErrorLike, "Pièce non retirée."), status: 400 };
  const storagePath = (doc as { storage_path?: string | null }).storage_path;
  if (storagePath) await remove([storagePath]);
  return { ok: true };
}
