import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { downloadCrmFile, safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { isPdfFile } from "@/lib/crm/ingest-types";
import { PriceRedactError, redactPdfPrices } from "@/lib/crm/pdf-price-redact";

/** Copie sans montants. Null si le PDF n’imprime aucun prix. */
export async function hiddenPricePath(opts: {
  bytes: Uint8Array;
  mime: string;
  name: string;
  bookingId: string;
}) {
  if (!isPdfFile(opts.mime, opts.name)) throw new PriceRedactError();
  const result = await redactPdfPrices(opts.bytes);
  if (!result.ok) throw new PriceRedactError();
  if (!result.changed) return null;
  const path = `bookings/${opts.bookingId}/prix-masque-${Date.now()}-${safeFileName(opts.name)}`;
  await uploadCrmFile(path, Buffer.from(result.bytes), "application/pdf");
  return path;
}

export async function hiddenPricePathFromStorage(opts: {
  storagePath: string;
  mime: string | null;
  name: string;
  bookingId: string;
}) {
  const file = await downloadCrmFile(opts.storagePath);
  return hiddenPricePath({
    bytes: file.bytes,
    mime: opts.mime || file.contentType,
    name: opts.name,
    bookingId: opts.bookingId,
  });
}

/** Le client et le partage lisent la copie dès que le prix est masqué. */
export async function viewerFilePath(path: string) {
  if (!path.startsWith("bookings/")) return path;
  const bookingId = path.split("/")[1] || "";
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return path;
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_booking_documents")
    .select("storage_path, client_storage_path, hide_prices")
    .eq("booking_id", bookingId);
  const doc = (data || []).find(
    (row) => row.storage_path === path || (row.client_storage_path && row.client_storage_path === path)
  );
  if (!doc || doc.hide_prices !== true || !doc.client_storage_path) return path;
  return doc.client_storage_path as string;
}
