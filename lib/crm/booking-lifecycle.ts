import { safeFileName } from "@/lib/crm/files";

export type ArchiveSource = {
  visible_to_client?: boolean | null;
};

export type RestoreSource = {
  archived_was_visible?: boolean | null;
};

export type DuplicateSource = {
  customer_id: string;
  billing_customer_id?: string | null;
  billing_company_id?: string | null;
  payer_kind?: "company" | "personal" | null;
  fees_follow_stay?: boolean | null;
  reference: string;
  title: string;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  currency?: string | null;
  total_amount?: number | null;
  include_in_ledger?: boolean | null;
  agency_commission?: boolean | null;
  client_settles_stay?: boolean | null;
  notes_client?: string | null;
  notes_internal?: string | null;
  prices_visible?: boolean | null;
  offer_chauffeur?: boolean | null;
  offer_greeter?: boolean | null;
  offer_checkin?: boolean | null;
  offer_visa?: boolean | null;
};

export function isBookingArchived(booking: { archived_at?: string | null } | null | undefined) {
  return Boolean(booking?.archived_at);
}

export function archiveBookingPatch(booking: ArchiveSource, archivedAt: string) {
  return {
    archived_at: archivedAt,
    archived_was_visible: Boolean(booking.visible_to_client),
    visible_to_client: false,
  };
}

export function restoreBookingPatch(booking: RestoreSource) {
  return {
    archived_at: null,
    archived_was_visible: null,
    visible_to_client: Boolean(booking.archived_was_visible),
  };
}

export function duplicateInternalNote(notes: string | null | undefined, sourceReference: string) {
  const line = `Copie de ${sourceReference}.`;
  const base = (notes || "").trim();
  if (!base) return line;
  if (base.split("\n").some((row) => row.trim() === line)) return base;
  return `${base}\n${line}`;
}

/** Nouveau dossier brouillon. Le client ne le voit pas tant qu’on ne le publie pas. */
export function duplicateBookingInsert(source: DuplicateSource, reference: string) {
  return {
    customer_id: source.customer_id,
    billing_customer_id: source.billing_customer_id || source.customer_id,
    billing_company_id: source.billing_company_id ?? null,
    payer_kind: source.payer_kind ?? null,
    fees_follow_stay: source.fees_follow_stay !== false,
    reference,
    title: source.title,
    destination: source.destination ?? null,
    status: "draft" as const,
    start_date: source.start_date ?? null,
    end_date: source.end_date ?? null,
    currency: source.currency || "EUR",
    total_amount: Number(source.total_amount) || 0,
    include_in_ledger: source.include_in_ledger !== false,
    agency_commission: Boolean(source.agency_commission),
    client_settles_stay: Boolean(source.client_settles_stay),
    notes_client: source.notes_client ?? null,
    notes_internal: duplicateInternalNote(source.notes_internal, source.reference),
    prices_visible: Boolean(source.prices_visible),
    offer_chauffeur: Boolean(source.offer_chauffeur),
    offer_greeter: Boolean(source.offer_greeter),
    offer_checkin: Boolean(source.offer_checkin),
    offer_visa: Boolean(source.offer_visa),
    visible_to_client: false,
    archived_at: null,
    archived_was_visible: null,
    cover_image_path: null,
    share_code: null,
  };
}

const ITEM_SKIP = new Set(["id", "booking_id", "created_at", "updated_at", "source_document_id"]);

export function duplicateItemRow(
  item: Record<string, unknown>,
  bookingId: string,
  sourceDocumentId: string | null
) {
  const row: Record<string, unknown> = {
    booking_id: bookingId,
    source_document_id: sourceDocumentId,
  };
  for (const [key, value] of Object.entries(item)) {
    if (ITEM_SKIP.has(key)) continue;
    row[key] = value;
  }
  if (row.details == null) row.details = {};
  return row;
}

const DOC_SKIP = new Set([
  "id",
  "booking_id",
  "created_at",
  "updated_at",
  "storage_path",
  "booking_item_id",
]);

export function duplicateDocumentRow(
  doc: Record<string, unknown>,
  bookingId: string,
  storagePath: string
) {
  const row: Record<string, unknown> = {
    booking_id: bookingId,
    storage_path: storagePath,
    booking_item_id: null,
  };
  for (const [key, value] of Object.entries(doc)) {
    if (DOC_SKIP.has(key)) continue;
    row[key] = value;
  }
  if (!row.kind) row.kind = "other";
  return row;
}

export function duplicateTravelerRow(traveler: Record<string, unknown>, bookingId: string) {
  return {
    booking_id: bookingId,
    companion_id: traveler.companion_id ?? null,
    is_account_holder: Boolean(traveler.is_account_holder),
    first_name: traveler.first_name ?? null,
    last_name: traveler.last_name ?? null,
  };
}

export function duplicateStoragePath(bookingId: string, fileName: string, index: number) {
  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
  return `bookings/${bookingId}/${safeIndex}-${safeFileName(fileName || "document")}`;
}

export function duplicateVisaRequestRow(row: Record<string, unknown>, bookingId: string) {
  return {
    booking_id: bookingId,
    country: row.country,
    status: row.status || "en_cours",
    step: row.step || "preparation",
    answers: row.answers && typeof row.answers === "object" ? row.answers : {},
    accepted_at: row.accepted_at ?? null,
    traveler_ids: Array.isArray(row.traveler_ids) ? row.traveler_ids : [],
    pay_attempts: 0,
    pliant_transaction_id: null,
    paid_cents: null,
  };
}

export function duplicateDeclinedServiceRow(row: Record<string, unknown>, bookingId: string) {
  return {
    booking_id: bookingId,
    kind: row.kind,
    service_leg: row.service_leg || "",
    place: row.place || "",
    moment: row.moment || "",
  };
}

/** Le texte du courrier est repris. Le statut repart en brouillon pour ne pas renvoyer le mail. */
export function duplicateHotelLetterRow(row: Record<string, unknown>, bookingId: string, itemId: string) {
  const choice = row.card_choice === "pliant" || row.card_choice === "client" ? row.card_choice : null;
  return {
    booking_id: bookingId,
    booking_item_id: itemId,
    kind: row.kind,
    status: "draft",
    recipients: Array.isArray(row.recipients) ? row.recipients : [],
    subject: row.subject || "",
    body: row.body || "",
    edited: Boolean(row.edited),
    card_choice: choice,
    attach_passports: Boolean(row.attach_passports),
    identity_document_ids: Array.isArray(row.identity_document_ids) ? row.identity_document_ids : [],
    identity_picked: Boolean(row.identity_picked),
    due_on: null,
    sent_at: null,
    follow_up_count: 0,
    last_follow_up_at: null,
    replied_at: null,
    reply_from: "",
    reply_subject: "",
    reply_body: "",
    reply_message_id: null,
    sent_subjects: [],
  };
}

export function duplicateCoverPath(bookingId: string, sourcePath: string) {
  const ext = sourcePath.split(".").pop()?.toLowerCase() || "";
  const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : "webp";
  return `bookings/${bookingId}/cover.${safeExt}`;
}
