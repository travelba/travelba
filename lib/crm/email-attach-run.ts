import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { closeIngestSiblings, noteIngestDecision } from "@/lib/crm/email-ingest";
import {
  attachmentSha256,
  bookingDocumentKind,
  emailDepositMessage,
  isDepositableAttachment,
  planEmailAttachmentCopies,
  type DepositOutcome,
} from "@/lib/crm/email-attach-files";
import { downloadCrmFile, safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { matchEmailToCard, type EmailCardRef, type EmailMention } from "@/lib/crm/email-card-match";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import type { CrmEmailIngest, EmailIngestAttachment } from "@/lib/crm/types";

type LoadedFile = {
  name: string;
  mime: string;
  bytes: Uint8Array;
  sha256: string;
};

function uploadExists(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || "");
  return /already exists|duplicate/i.test(message);
}

/**
 * Copie les pièces du mail sur le dossier. Ne crée ni ne modifie aucune carte.
 * La même empreinte n’est pas déposée deux fois. Les images de signature sont laissées.
 */
/**
 * Carte qui reçoit les pièces. Null : elles restent sur le dossier.
 * Ne crée ni ne modifie aucune carte.
 */
export async function resolveEmailCardId(
  admin: SupabaseClient,
  bookingId: string,
  extract: BookingExtract | null | undefined
): Promise<string | null> {
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, supplier, confirmation_ref, start_at, lifecycle, details")
    .eq("booking_id", bookingId);
  if (error) throw new Error("Cartes du dossier illisibles.");
  const mentions = (extract?.items || []) as EmailMention[];
  return matchEmailToCard((data || []) as EmailCardRef[], mentions);
}

export async function depositEmailAttachments(
  admin: SupabaseClient,
  bookingId: string,
  emailId: string,
  attachments: EmailIngestAttachment[] | null | undefined,
  bookingItemId?: string | null
): Promise<DepositOutcome> {
  const files: LoadedFile[] = [];
  let skipped = 0;
  let unreadable = 0;
  for (const att of attachments || []) {
    if (!att?.path) {
      unreadable += 1;
      continue;
    }
    let bytes: Uint8Array;
    let mime = att.mime_type || "";
    try {
      const downloaded = await downloadCrmFile(att.path);
      bytes = downloaded.bytes;
      mime = att.mime_type || downloaded.contentType || "";
    } catch {
      unreadable += 1;
      continue;
    }
    if (!bytes.byteLength) {
      unreadable += 1;
      continue;
    }
    const name = (att.name || "document").trim() || "document";
    if (!isDepositableAttachment({ name, mime, size: bytes.byteLength })) {
      skipped += 1;
      continue;
    }
    files.push({ name, mime, bytes, sha256: attachmentSha256(bytes) });
  }
  if (unreadable > 0) throw new Error("Pièce jointe illisible.");
  if (!files.length) return { added: 0, skipped, empty: true };

  const { data, error } = await admin
    .from("crm_booking_documents")
    .select("content_sha256")
    .eq("booking_id", bookingId);
  if (error) throw new Error("Pièces du dossier illisibles.");
  const existing = ((data || []) as { content_sha256: string | null }[]).map((row) => ({
    sha256: row.content_sha256,
  }));
  const plan = planEmailAttachmentCopies(files, existing);
  skipped += plan.skipped.length;

  let added = 0;
  for (const index of plan.copy) {
    const file = files[index];
    const path = `bookings/${bookingId}/${file.sha256}-${safeFileName(file.name)}`;
    try {
      await uploadCrmFile(path, Buffer.from(file.bytes), file.mime || "application/octet-stream");
    } catch (err) {
      if (!uploadExists(err)) throw new Error("Pièce jointe non enregistrée.");
    }
    const { error: insertError } = await admin.from("crm_booking_documents").insert({
      booking_id: bookingId,
      booking_item_id: bookingItemId || null,
      kind: bookingDocumentKind(file.name, file.mime),
      file_name: file.name,
      mime_type: file.mime || null,
      storage_path: path,
      visible_to_client: false,
      content_sha256: file.sha256,
      email_ingest_id: emailId,
    });
    if (insertError?.code === "23505") {
      skipped += 1;
      continue;
    }
    if (insertError) throw new Error("Pièce jointe non enregistrée.");
    added += 1;
  }
  return { added, skipped, empty: false };
}

/** Lie le mail au dossier pour l’historique. Ne touche pas aux cartes. */
export async function markEmailAttached(
  admin: SupabaseClient,
  row: CrmEmailIngest,
  opts: {
    bookingId: string;
    customerId: string | null;
    actorId: string | null;
    summary: string;
    cards: boolean;
  }
) {
  const { error } = await admin
    .from("crm_email_ingest")
    .update({ status: "attached", created_booking_id: opts.bookingId })
    .eq("id", row.id);
  if (error) throw new Error("E-mail non classé.");
  await closeIngestSiblings(admin, row, "attached", opts.actorId);
  await noteIngestDecision(admin, {
    actorKind: "human",
    actorId: opts.actorId,
    action: opts.cards ? "apply_cards" : "attach_files",
    emailIngestId: row.id,
    bookingId: opts.bookingId,
    customerId: opts.customerId,
    summary: opts.summary,
  });
}

export function attachFilesSummary(result: DepositOutcome, linked = false) {
  return emailDepositMessage(result, linked);
}
