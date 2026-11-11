import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { removeCrmFiles, safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { isUuid } from "@/lib/crm/ids";
import { missingDbColumn } from "@/lib/crm/optional-column";
import { syncCheckinWithPasses } from "@/lib/crm/online-checkin-db";
import { BOARDING_PASS_KIND } from "@/lib/crm/boarding-pass-whatsapp";
import {
  chooseWalletItem,
  isWalletPassName,
  matchWalletPass,
  readWalletPass,
  WALLET_PASS_MIME,
  type WalletPassExtract,
} from "@/lib/crm/pkpass";
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

type WalletPlacement = {
  kind: typeof BOARDING_PASS_KIND;
  mime: typeof WALLET_PASS_MIME;
  itemId: string | null;
  extracted: WalletPassExtract | null;
};

/**
 * Lit le passe au dépôt. Le fichier signé n’est pas modifié.
 * Le vol et le voyageur ne sont reliés que s’il n’y a qu’une réponse.
 */
export async function placeWalletPass(
  supabase: SupabaseClient,
  bookingId: string,
  file: { name: string; type: string; bytes: Uint8Array },
  requestedItemId: string | null
): Promise<WalletPlacement | null> {
  if (!isWalletPassName(file.name, file.type)) return null;
  const extract = readWalletPass(file.bytes);
  const [itemsRes, travelersRes] = await Promise.all([
    supabase
      .from("crm_booking_items")
      .select("id, kind, title, start_at, confirmation_ref, details, lifecycle")
      .eq("booking_id", bookingId)
      .eq("kind", "flight"),
    supabase.from("crm_booking_travelers").select("id, first_name, last_name, usage_name").eq("booking_id", bookingId),
  ]);
  const flights = ((itemsRes.data || []) as {
    id: string;
    title?: string | null;
    start_at?: string | null;
    confirmation_ref?: string | null;
    details?: Record<string, unknown> | null;
    lifecycle?: string | null;
  }[])
    .filter((row) => row.lifecycle !== "cancelled" && row.lifecycle !== "superseded")
    .map((row) => ({
      id: row.id,
      flightNumber: typeof row.details?.flight_number === "string" ? row.details.flight_number : null,
      date: row.start_at ? String(row.start_at).slice(0, 10) : null,
      pnr: row.confirmation_ref || (typeof row.details?.pnr === "string" ? row.details.pnr : null),
    }));
  const travelers = ((travelersRes.data || []) as {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    usage_name?: string | null;
  }[]).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    usageName: row.usage_name,
  }));
  const matched = extract ? matchWalletPass(extract, flights, travelers) : null;
  const requested = flights.find((flight) => flight.id === requestedItemId) || null;
  const itemId = chooseWalletItem(matched, matched?.itemId || null, requested);
  const extracted = matched
    ? {
        firstName: matched.firstName,
        lastName: matched.lastName,
        passenger: matched.passenger,
        flight: matched.flight,
        date: matched.date,
        seat: matched.seat,
        gate: matched.gate,
        pnr: matched.pnr,
        route: matched.route,
        travelerId: matched.travelerId,
      }
    : null;
  return {
    kind: BOARDING_PASS_KIND,
    mime: WALLET_PASS_MIME,
    itemId,
    extracted,
  };
}

export async function insertBookingDocument(supabase: SupabaseClient, row: Record<string, unknown>) {
  const run = (payload: Record<string, unknown>) =>
    supabase.from("crm_booking_documents").insert(payload).select("*").single();
  const first = await run(row);
  if (first.error && Object.prototype.hasOwnProperty.call(row, "extracted") && missingDbColumn(first.error, "extracted")) {
    const next = { ...row };
    delete next.extracted;
    return run(next);
  }
  return first;
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
  const requestedItemId = String(input.itemId || "").trim() || null;
  const wallet = await placeWalletPass(supabase, input.bookingId, input.file, requestedItemId);
  const kind = wallet ? wallet.kind : bookingDocumentKind(String(input.kind || "other"));
  const itemId = wallet ? wallet.itemId : requestedItemId;
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
  const mime = wallet ? wallet.mime : input.file.type || "application/octet-stream";
  await (input.upload ?? uploadCrmFile)(path, input.file.bytes, mime);
  const { data, error } = await insertBookingDocument(supabase, {
    booking_id: input.bookingId,
    booking_item_id: itemId,
    kind,
    file_name: input.file.name,
    mime_type: mime,
    storage_path: path,
    visible_to_client: wallet ? false : input.visibleToClient === true,
    ...(wallet ? { extracted: wallet.extracted } : {}),
  });
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
