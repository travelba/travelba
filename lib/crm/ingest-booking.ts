import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { nextBookingReference, syncBookingLedger } from "@/lib/crm/bookings";
import {
  copyCrmFile,
  listCrmFiles,
  removeCrmFiles,
  safeFileName,
  uploadCrmFile,
} from "@/lib/crm/files";
import { emptyToNull } from "@/lib/crm/identity";
import { extractBookingFromFiles } from "@/lib/crm/ingest-file";
import {
  bookingExtractSchema,
  aiGatewayConfigured,
  bookingStatusFromExtract,
  guessIngestMime,
  isAllowedIngestType,
  normalizeHotelExtractItem,
  sanitizeExtractedPrices,
  sellingTotalFromExtract,
  MAX_INGEST_BYTES,
  MAX_INGEST_FILES,
  type BookingExtract,
  type IngestStagedFile,
} from "@/lib/crm/ingest-types";
import { assertStaffIngestPath, ingestBatchPrefix } from "@/lib/crm/ingest-storage";
import { sortItemsByOrder } from "@/lib/crm/carnet";
import { scheduleBookingCover } from "@/lib/crm/cover-generate";
import { findMatchingItem } from "@/lib/crm/item-match";
import { isPlaceholderTraveler, matchTravelerToParty, sameRecordedTraveler } from "@/lib/crm/person-match";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import {
  BOOKING_ITEM_KINDS,
  type BookingItemKind,
  type BookingStatus,
  type CrmBooking,
  type CrmBookingItem,
  type CrmCompanion,
  type CrmCustomer,
} from "@/lib/crm/types";

export { bookingExtractSchema, aiGatewayConfigured, type BookingExtract };
export { extractBookingFromFiles };
export { MAX_INGEST_BYTES, MAX_INGEST_FILES };

export function collectIngestFiles(form: FormData) {
  const files: File[] = [];
  for (const key of ["files", "file"]) {
    for (const value of form.getAll(key)) {
      if (value instanceof File && value.size > 0) files.push(value);
    }
  }
  return files;
}

export function collectStagedFiles(form: FormData): IngestStagedFile[] {
  const raw = form.get("staged");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        path: String(row?.path || ""),
        name: String(row?.name || ""),
        type: row?.type ? String(row.type) : null,
      }))
      .filter((row) => row.path && row.name);
  } catch {
    throw new Error("Fichiers joints invalides");
  }
}

export function assertIngestFiles(files: File[]) {
  if (files.length === 0) throw new Error("Ajoutez au moins un PDF ou une photo.");
  if (files.length > MAX_INGEST_FILES) {
    throw new Error(`Maximum ${MAX_INGEST_FILES} fichiers.`);
  }
  for (const file of files) {
    if (file.size > MAX_INGEST_BYTES) {
      throw new Error(`${file.name} dépasse 25 Mo.`);
    }
    if (!isAllowedIngestType(file.type, file.name)) {
      throw new Error(`${file.name} : PDF ou image uniquement.`);
    }
  }
}

export async function cleanupIngestBatch(staffUserId: string, batchId: string) {
  try {
    const prefix = ingestBatchPrefix(staffUserId, batchId);
    const paths = await listCrmFiles(prefix);
    await removeCrmFiles(paths);
  } catch (err) {
    console.error("[ingest-tmp] cleanup", err instanceof Error ? err.message : err);
  }
}

function normalizeName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function matchCustomerId(customers: CrmCustomer[], extract: BookingExtract) {
  const email = extract.customer_email?.trim().toLowerCase();
  if (email) {
    const hit = customers.find((c) => c.email.toLowerCase() === email);
    if (hit) return hit.id;
  }
  const last = normalizeName(extract.customer_last_name);
  const first = normalizeName(extract.customer_first_name);
  if (!last) return null;
  const hits = customers.filter((c) => {
    if (normalizeName(c.last_name) !== last) return false;
    if (!first) return true;
    const cf = normalizeName(c.first_name);
    return cf === first || cf.startsWith(first) || first.startsWith(cf);
  });
  return hits.length === 1 ? hits[0].id : null;
}

const FORBIDDEN_DETAIL_KEY =
  /cancel|annul|franchise|cgv|net_rate|net_price|supplier_net|penalit/i;

function cleanDetails(details: BookingExtract["items"][number]["details"] | undefined) {
  const raw = details || {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_DETAIL_KEY.test(key)) continue;
    if (value == null || value === "") continue;
    if (typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const cleaned = value
        .map((entry) => {
          if (entry && typeof entry === "object") {
            const rec: Record<string, string> = {};
            for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
              const text = emptyToNull(v);
              if (text) rec[k] = text;
            }
            return Object.keys(rec).length ? rec : null;
          }
          return emptyToNull(entry);
        })
        .filter(Boolean);
      if (cleaned.length) out[key] = cleaned;
      continue;
    }
    const text = emptyToNull(value);
    if (text) out[key] = text;
  }
  return out;
}

function itemKind(value: string | null | undefined): BookingItemKind {
  return (BOOKING_ITEM_KINDS as readonly string[]).includes(value || "")
    ? (value as BookingItemKind)
    : "fee";
}

type UploadedDoc = { id: string; file_name: string | null };

async function insertBookingDoc(
  supabase: SupabaseClient,
  bookingId: string,
  opts: {
    name: string;
    mime: string;
    storagePath: string;
    visibleToClient: boolean;
  }
): Promise<UploadedDoc> {
  const { data, error } = await supabase
    .from("crm_booking_documents")
    .insert({
      booking_id: bookingId,
      kind: opts.mime.includes("pdf") ? "pdf" : "image",
      file_name: opts.name,
      mime_type: opts.mime,
      storage_path: opts.storagePath,
      visible_to_client: opts.visibleToClient,
    })
    .select("id, file_name")
    .single();
  if (error) throw dbFailure(error, "Pièce jointe non enregistrée.");
  return { id: data.id, file_name: data.file_name };
}

async function attachBookingFiles(
  bookingId: string,
  staged: IngestStagedFile[],
  files: File[],
  visibleToClient: boolean,
  supabase: SupabaseClient,
  staffUserId?: string
): Promise<UploadedDoc[]> {
  const uploaded: UploadedDoc[] = [];
  for (const file of staged) {
    if (staffUserId) assertStaffIngestPath(file.path, staffUserId);
    const mime = file.type || guessIngestMime(file.name);
    const dest = `bookings/${bookingId}/${Date.now()}-${safeFileName(file.name)}`;
    await copyCrmFile(file.path, dest);
    uploaded.push(
      await insertBookingDoc(supabase, bookingId, {
        name: file.name,
        mime,
        storagePath: dest,
        visibleToClient,
      })
    );
  }
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || guessIngestMime(file.name);
    const path = `bookings/${bookingId}/${Date.now()}-${safeFileName(file.name)}`;
    await uploadCrmFile(path, bytes, mime);
    uploaded.push(
      await insertBookingDoc(supabase, bookingId, {
        name: file.name,
        mime,
        storagePath: path,
        visibleToClient,
      })
    );
  }
  return uploaded;
}

function sourceDocId(
  details: Record<string, unknown>,
  docs: UploadedDoc[]
): string | null {
  const name = emptyToNull(details.source_file_name);
  if (!name) return docs[0]?.id || null;
  const hit = docs.find(
    (doc) => (doc.file_name || "").toLowerCase() === name.toLowerCase()
  );
  return hit?.id || docs[0]?.id || null;
}

async function upsertItemsAndTravelers(
  supabase: SupabaseClient,
  bookingId: string,
  extract: BookingExtract,
  customer: CrmCustomer,
  companions: CrmCompanion[],
  existingTravelers: { first_name: string | null; last_name: string | null }[],
  existingItems: CrmBookingItem[],
  docs: UploadedDoc[]
) {
  const remaining = [...existingItems];
  let sort = existingItems.reduce((max, row) => Math.max(max, row.sort_order || 0), -1) + 1;
  const ordered = sortItemsByOrder(extract.items || []);
  let saved = 0;
  let lastError = "";

  for (const raw of ordered) {
    const item = raw.kind === "hotel" ? normalizeHotelExtractItem(raw) : raw;
    const title = String(item.title || "").trim();
    if (!title) continue;
    const details = cleanDetails(item.details);
    if (item.confirmation_ref && !details.pnr) details.pnr = item.confirmation_ref;
    const payload = {
      kind: itemKind(item.kind),
      title,
      supplier: emptyToNull(item.supplier),
      confirmation_ref: emptyToNull(item.confirmation_ref),
      start_at: emptyToNull(item.start_at),
      end_at: emptyToNull(item.end_at),
      amount: item.amount == null ? null : Number(item.amount),
      details,
      visible_to_client: false,
      source_document_id: sourceDocId(details, docs),
    };
    const match = findMatchingItem(remaining, {
      kind: payload.kind,
      confirmation_ref: payload.confirmation_ref,
      start_at: payload.start_at,
      title: payload.title,
      details,
    });
    try {
      if (match) {
        const { error } = await supabase
          .from("crm_booking_items")
          .update(payload)
          .eq("id", match.id);
        if (error) throw dbFailure(error, "Carte non mise à jour.");
        Object.assign(match, payload);
      } else {
        const { data: inserted, error } = await supabase
          .from("crm_booking_items")
          .insert({
            booking_id: bookingId,
            sort_order: sort++,
            ...payload,
          })
          .select("id")
          .single();
        if (error) throw dbFailure(error, "Carte non enregistrée.");
        if (inserted?.id) {
          remaining.push({
            id: inserted.id,
            booking_id: bookingId,
            sort_order: sort - 1,
            created_at: "",
            updated_at: "",
            ...payload,
          } as CrmBookingItem);
        }
      }
      saved += 1;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Carte ignorée";
    }
  }

  if (!saved && lastError) throw new Error(lastError);

  const incoming = extract.travelers || [];
  const skipPlaceholders =
    incoming.some((traveler) => {
      const first = emptyToNull(traveler.first_name);
      const last = emptyToNull(traveler.last_name);
      return Boolean(first || last) && !isPlaceholderTraveler(first, last);
    }) ||
    existingTravelers.some(
      (traveler) =>
        Boolean(traveler.first_name || traveler.last_name) &&
        !isPlaceholderTraveler(traveler.first_name, traveler.last_name)
    );

  for (const traveler of incoming) {
    const first = emptyToNull(traveler.first_name);
    const last = emptyToNull(traveler.last_name);
    if (!first && !last) continue;
    if (skipPlaceholders && isPlaceholderTraveler(first, last)) continue;
    const recorded = { first_name: first, last_name: last };
    if (existingTravelers.some((row) => sameRecordedTraveler(row, recorded))) continue;
    const match = matchTravelerToParty(recorded, customer, companions);
    const companion =
      match?.kind === "companion" ? companions.find((row) => row.id === match.id) : null;
    const { error } = await supabase.from("crm_booking_travelers").insert({
      booking_id: bookingId,
      companion_id: companion?.id || null,
      is_account_holder: match?.kind === "holder",
      first_name: first || companion?.first_name || null,
      last_name: last || companion?.last_name || null,
    });
    if (error) continue;
    existingTravelers.push(recorded);
  }

  await reconcileCustomerParty(customer.id, supabase);
}

export async function persistNewBookingFromExtract(opts: {
  customerId: string;
  extract: BookingExtract;
  files?: File[];
  staged?: IngestStagedFile[];
  staffUserId?: string;
  batchId?: string;
  status: BookingStatus;
  visibleToClient: boolean;
  /** Client authentifié de l’agent : la RPC de référence tourne sous son rôle (crm_private). */
  referenceClient?: SupabaseClient;
}) {
  const admin = createServiceClient();
  const [{ data: customer }, { data: companions }] = await Promise.all([
    admin.from("crm_customers").select("*").eq("id", opts.customerId).maybeSingle(),
    admin.from("crm_travel_companions").select("*").eq("customer_id", opts.customerId),
  ]);
  if (!customer) throw new Error("Client introuvable");
  if (opts.extract.document_status === "identity") {
    throw new Error("Document d’identité : enregistrez-le dans le profil, pas en réservation.");
  }
  const reference = await nextBookingReference(opts.referenceClient ?? admin);
  const extract = opts.extract;
  const title =
    emptyToNull(extract.title) ||
    emptyToNull(extract.destination) ||
    "Voyage";
  const totalAmount = sellingTotalFromExtract(extract) ?? 0;
  const status = bookingStatusFromExtract(extract, opts.status);
  const { data, error } = await admin
    .from("crm_bookings")
    .insert({
      customer_id: opts.customerId,
      reference,
      title,
      destination: emptyToNull(extract.destination),
      status,
      start_date: emptyToNull(extract.start_date),
      end_date: emptyToNull(extract.end_date),
      currency: emptyToNull(extract.currency) || "EUR",
      total_amount: totalAmount,
      notes_client: emptyToNull(extract.notes_client),
      notes_internal:
        extract.document_status === "quote"
          ? "Devis importé — tarifs non bloqués, à confirmer."
          : (opts.staged?.length || opts.files?.length)
            ? "Dossier créé par lecture de documents."
            : "Dossier créé par l’agence.",
      visible_to_client: false,
    })
    .select("*")
    .single();
  if (error || !data) throw dbFailure(error, "Création du dossier impossible.");
  const booking = data as CrmBooking;
  const docs = await attachBookingFiles(
    booking.id,
    opts.staged || [],
    opts.files || [],
    false,
    admin,
    opts.staffUserId
  );
  if (opts.staffUserId && opts.batchId) {
    await cleanupIngestBatch(opts.staffUserId, opts.batchId);
  }
  await upsertItemsAndTravelers(
    admin,
    booking.id,
    extract,
    customer as CrmCustomer,
    (companions || []) as CrmCompanion[],
    [],
    [],
    docs
  );
  await syncBookingLedger(admin, booking);
  const hotel = extract.items?.find((row) => row.kind === "hotel");
  scheduleBookingCover(booking, {
    hotel: hotel?.details?.hotel_name || hotel?.title || null,
  });
  return booking;
}

export async function applyExtractToBooking(opts: {
  bookingId: string;
  customerId: string;
  extract: BookingExtract;
  files?: File[];
  staged?: IngestStagedFile[];
  staffUserId?: string;
  batchId?: string;
  visibleToClient: boolean;
}) {
  const admin = createServiceClient();
  const { data: booking } = await admin
    .from("crm_bookings")
    .select("*")
    .eq("id", opts.bookingId)
    .maybeSingle();
  if (!booking || booking.customer_id !== opts.customerId) {
    throw new Error("Réservation introuvable");
  }
  const [{ data: customer }, { data: companions }, { data: travelers }, { data: items }] =
    await Promise.all([
      admin.from("crm_customers").select("*").eq("id", opts.customerId).maybeSingle(),
      admin.from("crm_travel_companions").select("*").eq("customer_id", opts.customerId),
      admin.from("crm_booking_travelers").select("first_name, last_name").eq("booking_id", opts.bookingId),
      admin.from("crm_booking_items").select("*").eq("booking_id", opts.bookingId),
    ]);
  if (!customer) throw new Error("Client introuvable");
  if (opts.extract.document_status === "identity") {
    throw new Error("Document d’identité : enregistrez-le dans le profil, pas en réservation.");
  }
  const docs = await attachBookingFiles(
    opts.bookingId,
    opts.staged || [],
    opts.files || [],
    false,
    admin,
    opts.staffUserId
  );
  if (opts.staffUserId && opts.batchId) {
    await cleanupIngestBatch(opts.staffUserId, opts.batchId);
  }
  await upsertItemsAndTravelers(
    admin,
    opts.bookingId,
    opts.extract,
    customer as CrmCustomer,
    (companions || []) as CrmCompanion[],
    (travelers || []) as { first_name: string | null; last_name: string | null }[],
    (items || []) as CrmBookingItem[],
    docs
  );
  const patch: Record<string, unknown> = {};
  if (!booking.title && opts.extract.title) patch.title = opts.extract.title;
  if (!booking.destination && opts.extract.destination) patch.destination = opts.extract.destination;
  if (!booking.start_date && opts.extract.start_date) patch.start_date = opts.extract.start_date;
  if (!booking.end_date && opts.extract.end_date) patch.end_date = opts.extract.end_date;
  const proposedTotal = sellingTotalFromExtract(opts.extract);
  if (!Number(booking.total_amount) && proposedTotal) {
    patch.total_amount = proposedTotal;
  }
  if (booking.status === "draft" && opts.extract.document_status === "confirmed") {
    patch.status = "confirmed";
  }
  if (Object.keys(patch).length) {
    await admin.from("crm_bookings").update(patch).eq("id", opts.bookingId);
  }
  const { data: refreshed } = await admin
    .from("crm_bookings")
    .select("*")
    .eq("id", opts.bookingId)
    .maybeSingle();
  const next = (refreshed || booking) as CrmBooking;
  await syncBookingLedger(admin, next, booking.status as BookingStatus);
  const hotel = opts.extract.items?.find((item) => item.kind === "hotel");
  scheduleBookingCover(
    {
      ...next,
      destination: (patch.destination as string) || next.destination,
      title: (patch.title as string) || next.title,
    } as CrmBooking,
    { hotel: hotel?.details?.hotel_name || hotel?.title || null }
  );
  return next;
}

export function parseExtractPayload(raw: unknown): BookingExtract {
  const parsed = bookingExtractSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "[ingest] extract_invalid",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      }))
    );
    throw new Error("Données extraites invalides");
  }
  return sanitizeExtractedPrices(parsed.data);
}

function dbFailure(error: DbErrorLike, fallback: string) {
  console.error("[ingest] db:", error?.code ?? "?", error?.message ?? "");
  return new Error(dbErrorMessage(error, fallback));
}
