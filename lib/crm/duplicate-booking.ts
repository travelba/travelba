import "server-only";

import { BookingActionError } from "@/lib/crm/archive-booking";
import {
  duplicateBookingInsert,
  duplicateCoverPath,
  duplicateDeclinedServiceRow,
  duplicateDocumentRow,
  duplicateHotelLetterRow,
  duplicateItemRow,
  duplicateStoragePath,
  duplicateTravelerRow,
  duplicateVisaRequestRow,
} from "@/lib/crm/booking-lifecycle";
import { nextBookingReference, refreshBookingLedger } from "@/lib/crm/bookings";
import { deleteBookingById } from "@/lib/crm/delete-booking";
import { copyCrmFile, removeCrmFiles } from "@/lib/crm/files";
import { isUuid } from "@/lib/crm/ids";
import type { CrmBooking } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

async function copyChildren(
  admin: SupabaseClient,
  sourceId: string,
  copyId: string,
  copiedPaths: string[]
) {
  const [{ data: items, error: itemsError }, { data: docs, error: docsError }, { data: travelers, error: travelersError }] =
    await Promise.all([
      admin.from("crm_booking_items").select("*").eq("booking_id", sourceId).order("sort_order"),
      admin.from("crm_booking_documents").select("*").eq("booking_id", sourceId),
      admin.from("crm_booking_travelers").select("*").eq("booking_id", sourceId),
    ]);
  if (itemsError) throw new Error(itemsError.message);
  if (docsError) throw new Error(docsError.message);
  if (travelersError) throw new Error(travelersError.message);

  const docIdMap = new Map<string, string>();
  let index = 0;
  for (const doc of (docs || []) as Record<string, unknown>[]) {
    const sourcePath = typeof doc.storage_path === "string" ? doc.storage_path : "";
    if (!sourcePath || typeof doc.id !== "string") continue;
    const fileName = typeof doc.file_name === "string" ? doc.file_name : "document";
    const path = duplicateStoragePath(copyId, fileName, index);
    index += 1;
    try {
      await copyCrmFile(sourcePath, path);
    } catch {
      continue;
    }
    copiedPaths.push(path);
    const { data, error } = await admin
      .from("crm_booking_documents")
      .insert(duplicateDocumentRow(doc, copyId, path))
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Document non copié");
    docIdMap.set(doc.id, data.id as string);
  }

  const itemIdMap = new Map<string, string>();
  for (const item of (items || []) as Record<string, unknown>[]) {
    if (typeof item.id !== "string") continue;
    const previousDoc = typeof item.source_document_id === "string" ? item.source_document_id : "";
    const sourceDoc = previousDoc ? docIdMap.get(previousDoc) || null : null;
    const { data, error } = await admin
      .from("crm_booking_items")
      .insert(duplicateItemRow(item, copyId, sourceDoc))
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Carte non copiée");
    itemIdMap.set(item.id, data.id as string);
  }

  for (const doc of (docs || []) as Record<string, unknown>[]) {
    if (typeof doc.id !== "string") continue;
    const newDocId = docIdMap.get(doc.id);
    const previousItem = typeof doc.booking_item_id === "string" ? doc.booking_item_id : "";
    const newItemId = previousItem ? itemIdMap.get(previousItem) : null;
    if (!newDocId || !newItemId) continue;
    const { error } = await admin.from("crm_booking_documents").update({ booking_item_id: newItemId }).eq("id", newDocId);
    if (error) throw new Error(error.message);
  }

  const travelerRows = ((travelers || []) as Record<string, unknown>[]).map((traveler) =>
    duplicateTravelerRow(traveler, copyId)
  );
  if (travelerRows.length) {
    const { error } = await admin.from("crm_booking_travelers").insert(travelerRows);
    if (error) throw new Error(error.message);
  }

  const [{ data: visas, error: visaError }, { data: declined, error: declinedError }, { data: letters, error: letterError }] =
    await Promise.all([
      admin.from("crm_visa_requests").select("*").eq("booking_id", sourceId),
      admin.from("crm_declined_services").select("*").eq("booking_id", sourceId),
      admin.from("crm_hotel_requests").select("*").eq("booking_id", sourceId),
    ]);
  if (visaError) throw new Error(visaError.message);
  if (declinedError) throw new Error(declinedError.message);
  if (letterError) throw new Error(letterError.message);

  const visaRows = ((visas || []) as Record<string, unknown>[]).map((row) => duplicateVisaRequestRow(row, copyId));
  if (visaRows.length) {
    const { error } = await admin.from("crm_visa_requests").insert(visaRows);
    if (error) throw new Error(error.message);
  }

  const declinedRows = ((declined || []) as Record<string, unknown>[]).map((row) =>
    duplicateDeclinedServiceRow(row, copyId)
  );
  if (declinedRows.length) {
    const { error } = await admin.from("crm_declined_services").insert(declinedRows);
    if (error) throw new Error(error.message);
  }

  const letterRows = ((letters || []) as Record<string, unknown>[])
    .map((row) => {
      const previous = typeof row.booking_item_id === "string" ? row.booking_item_id : "";
      const itemId = previous ? itemIdMap.get(previous) : "";
      if (!itemId) return null;
      return duplicateHotelLetterRow(row, copyId, itemId);
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (letterRows.length) {
    const { error } = await admin.from("crm_hotel_requests").insert(letterRows);
    if (error) throw new Error(error.message);
  }
}

export async function duplicateBookingById(bookingId: string) {
  if (!isUuid(bookingId)) throw new BookingActionError("Identifiant invalide");
  const admin = createServiceClient();
  const { data, error } = await admin.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (error) throw new BookingActionError(error.message, 500);
  if (!data) throw new BookingActionError("Réservation introuvable", 404);
  const source = data as CrmBooking;

  let reference: string;
  try {
    reference = await nextBookingReference(admin);
  } catch (err) {
    throw new BookingActionError(err instanceof Error ? err.message : "Référence indisponible", 500);
  }

  const { data: created, error: insertError } = await admin
    .from("crm_bookings")
    .insert(duplicateBookingInsert(source, reference))
    .select("*")
    .single();
  if (insertError || !created) throw new BookingActionError(insertError?.message || "Copie impossible");
  const copy = created as CrmBooking;
  const copiedPaths: string[] = [];
  try {
    await copyChildren(admin, source.id, copy.id, copiedPaths);
    if (source.cover_image_path) {
      const coverPath = duplicateCoverPath(copy.id, source.cover_image_path);
      try {
        await copyCrmFile(source.cover_image_path, coverPath);
        const { error: coverError } = await admin
          .from("crm_bookings")
          .update({ cover_image_path: coverPath, cover_credit: source.cover_credit })
          .eq("id", copy.id);
        if (coverError) {
          await removeCrmFiles([coverPath]);
        } else {
          copiedPaths.push(coverPath);
        }
      } catch {
        // Le séjour copié reste ouvrable avec la photo du lieu.
      }
    }
    await refreshBookingLedger(admin, copy.id);
  } catch (err) {
    try {
      await deleteBookingById(copy.id);
    } catch {
      await removeCrmFiles(copiedPaths);
    }
    throw new BookingActionError(err instanceof Error ? err.message : "Copie impossible");
  }

  const { data: fresh } = await admin.from("crm_bookings").select("*").eq("id", copy.id).maybeSingle();
  return { booking: (fresh || copy) as CrmBooking };
}
