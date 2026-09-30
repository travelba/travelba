import "server-only";
import { refreshBookingLedger } from "@/lib/crm/bookings";
import { deleteBookingById } from "@/lib/crm/delete-booking";
import { planEmailDetach, type DetachExtractItem, type DetachPerson } from "@/lib/crm/email-detach";
import { removeCrmFiles } from "@/lib/crm/files";
import type { CrmBookingItem, CrmEmailIngest } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractParts(raw: unknown) {
  const record = asRecord(raw);
  const items = Array.isArray(record?.items) ? record.items : [];
  const travelers = Array.isArray(record?.travelers) ? record.travelers : [];
  return {
    items: items.map((item) => {
      const row = asRecord(item) || {};
      return {
        kind: typeof row.kind === "string" ? row.kind : "fee",
        title: typeof row.title === "string" ? row.title : null,
        confirmation_ref: typeof row.confirmation_ref === "string" ? row.confirmation_ref : null,
        start_at: typeof row.start_at === "string" ? row.start_at : null,
        end_at: typeof row.end_at === "string" ? row.end_at : null,
        supplier: typeof row.supplier === "string" ? row.supplier : null,
        details: asRecord(row.details),
      } satisfies DetachExtractItem;
    }),
    travelers: travelers.map((person) => {
      const row = asRecord(person) || {};
      return {
        first_name: typeof row.first_name === "string" ? row.first_name : null,
        last_name: typeof row.last_name === "string" ? row.last_name : null,
      } satisfies DetachPerson;
    }),
  };
}

export async function detachAttachedEmail(row: CrmEmailIngest) {
  if (row.status !== "attached" || !row.created_booking_id) {
    throw new Error("Ce mail n’est pas rattaché à un voyage");
  }
  const bookingId = row.created_booking_id;
  const admin = createServiceClient();
  const [
    { data: booking, error: bookingError },
    { data: items, error: itemsError },
    { data: documents, error: documentsError },
    { data: travelers, error: travelersError },
    { data: arrivals, error: arrivalsError },
    { data: credits, error: creditsError },
  ] = await Promise.all([
    admin
      .from("crm_bookings")
      .select("id, status, visible_to_client, notes_internal")
      .eq("id", bookingId)
      .maybeSingle(),
    admin.from("crm_booking_items").select("*").eq("booking_id", bookingId),
    admin
      .from("crm_booking_documents")
      .select("id, file_name, storage_path, booking_item_id, created_at")
      .eq("booking_id", bookingId),
    admin
      .from("crm_booking_travelers")
      .select("id, first_name, last_name, created_at")
      .eq("booking_id", bookingId),
    admin.from("crm_hotel_arrivals").select("booking_item_id, status").eq("booking_id", bookingId),
    admin
      .from("crm_transactions")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("direction", "credit")
      .eq("status", "posted")
      .limit(1),
  ]);
  const readError = bookingError || itemsError || documentsError || travelersError || arrivalsError || creditsError;
  if (readError) throw new Error("Lecture du dossier impossible");
  if (!booking) throw new Error("Voyage introuvable");

  const extract = extractParts(row.extract);
  const plan = planEmailDetach({
    emailId: row.id,
    bookingId,
    attachedAt: row.updated_at,
    suggestedCustomerId: row.suggested_customer_id,
    extractItems: extract.items,
    extractTravelers: extract.travelers,
    attachmentNames: (row.attachments || []).map((file) => file.name),
    items: ((items || []) as CrmBookingItem[]).map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      confirmation_ref: item.confirmation_ref,
      start_at: item.start_at,
      end_at: item.end_at,
      supplier: item.supplier,
      details: item.details,
      source_document_id: item.source_document_id,
      created_at: item.created_at,
    })),
    documents: documents || [],
    travelers: travelers || [],
    arrivals: arrivals || [],
    booking: {
      status: booking.status,
      visible_to_client: Boolean(booking.visible_to_client),
      notes_internal: booking.notes_internal,
    },
    hasPostedCredit: (credits || []).length > 0,
  });
  if (plan.blocked) throw new Error(plan.message || "Rien n’a été retiré.");

  if (plan.deleteBooking) {
    await deleteBookingById(bookingId);
  } else {
    if (plan.travelerIds.length) {
      const { error } = await admin
        .from("crm_booking_travelers")
        .delete()
        .in("id", plan.travelerIds)
        .eq("booking_id", bookingId);
      if (error) throw new Error("Voyageur non retiré");
    }
    if (plan.documentIds.length) {
      const { error } = await admin
        .from("crm_booking_documents")
        .delete()
        .in("id", plan.documentIds)
        .eq("booking_id", bookingId);
      if (error) throw new Error("Pièce non retirée");
      if (plan.storagePaths.length) await removeCrmFiles(plan.storagePaths);
    }
    if (plan.itemIds.length) {
      const { error } = await admin
        .from("crm_booking_items")
        .delete()
        .in("id", plan.itemIds)
        .eq("booking_id", bookingId);
      if (error) throw new Error("Carte non retirée");
    }
    await refreshBookingLedger(admin, bookingId);
  }

  const { error: mailError } = await admin
    .from("crm_email_ingest")
    .update({ status: plan.nextStatus, created_booking_id: null })
    .eq("id", row.id);
  if (mailError) throw new Error("Le mail n’a pas pu revenir dans la file");

  return {
    status: plan.nextStatus,
    kept: plan.keptItems.map((item) => item.title),
    deleted_booking: plan.deleteBooking,
  };
}
