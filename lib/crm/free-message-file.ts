import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadCrmFile } from "./files";
import {
  freeMessageHeader,
  freeMessageIdentityBlocked,
  type FreeMessageHeader,
} from "./free-message-whatsapp";

export type FreeMessageStored = {
  id: string;
  mime: string | null;
  fileName: string | null;
  storagePath: string;
  docType: string | null;
  customerId: string | null;
  bookingId: string | null;
};

/** Le fichier public ne sert que s’il est un PDF ou une image, et pas une pièce d’identité. */
export function freeMessagePublicFile(
  row: { docType?: string | null; mime: string | null; storagePath: string | null; fileName: string | null },
  requestedName: string
): { storagePath: string; contentType: string; header: FreeMessageHeader } | null {
  if (!row.storagePath || freeMessageIdentityBlocked(row.docType)) return null;
  const named = freeMessageHeader(null, requestedName);
  const stored = freeMessageHeader(row.mime, row.fileName || row.storagePath);
  if (!named || !stored || named !== stored) return null;
  const contentType = named === "document" ? "application/pdf" : requestedName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return { storagePath: row.storagePath, contentType, header: named };
}

type TravelRow = {
  id: string;
  customer_id: string | null;
  booking_id: string | null;
  doc_type: string | null;
  mime_type: string | null;
  file_name: string | null;
  storage_path: string | null;
};

type BookingFileRow = {
  id: string;
  booking_id: string | null;
  kind: string | null;
  mime_type: string | null;
  file_name: string | null;
  storage_path: string | null;
};

export async function loadFreeMessageDocument(
  db: SupabaseClient,
  documentId: string
): Promise<FreeMessageStored | null> {
  const travel = await db
    .from("crm_travel_documents")
    .select("id, customer_id, booking_id, doc_type, mime_type, file_name, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (travel.error) return null;
  const doc = travel.data as TravelRow | null;
  if (doc?.storage_path) {
    return {
      id: doc.id,
      mime: doc.mime_type,
      fileName: doc.file_name,
      storagePath: doc.storage_path,
      docType: doc.doc_type,
      customerId: doc.customer_id,
      bookingId: doc.booking_id,
    };
  }
  const bookingFile = await db
    .from("crm_booking_documents")
    .select("id, booking_id, kind, mime_type, file_name, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (bookingFile.error) return null;
  const file = bookingFile.data as BookingFileRow | null;
  if (!file?.storage_path || !file.booking_id) return null;
  const booking = await db.from("crm_bookings").select("customer_id").eq("id", file.booking_id).maybeSingle();
  if (booking.error) return null;
  const owner = booking.data as { customer_id?: string | null } | null;
  return {
    id: file.id,
    mime: file.mime_type,
    fileName: file.file_name,
    storagePath: file.storage_path,
    docType: file.kind,
    customerId: owner?.customer_id || null,
    bookingId: file.booking_id,
  };
}

export async function readFreeMessageBytes(storagePath: string, header: FreeMessageHeader) {
  const downloaded = await downloadCrmFile(storagePath);
  const actual = freeMessageHeader(downloaded.contentType, storagePath);
  if (actual !== header) return null;
  return downloaded.bytes;
}
