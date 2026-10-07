import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import {
  nextBookingReference,
  syncBookingLedger,
  syncBookingTitleFromSteps,
  syncBookingTotalFromItems,
} from "@/lib/crm/bookings";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { defaultPayer } from "@/lib/crm/payer";
import {
  copyCrmFile,
  listCrmFiles,
  removeCrmFiles,
  safeFileName,
  uploadCrmFile,
} from "@/lib/crm/files";
import { emptyToNull } from "@/lib/crm/identity";
import { dossierTitle } from "@/lib/crm/ingest-title";
import { bookingCurrencyFromReview } from "@/lib/crm/stay-currency";
import { parseMoney } from "@/lib/crm/money";
import { extractBookingFromFiles } from "@/lib/crm/ingest-file";
import {
  bookingExtractSchema,
  aiGatewayConfigured,
  bookingStatusFromExtract,
  guessIngestMime,
  isCancellationExtract,
  keepAgentPrices,
  normalizeHotelExtractItem,
  sellingTotalFromExtract,
  MAX_INGEST_BYTES,
  MAX_INGEST_FILES,
  type BookingExtract,
  type IngestStagedFile,
} from "@/lib/crm/ingest-types";
import { assertStaffIngestPath, ingestBatchPrefix } from "@/lib/crm/ingest-storage";
import { sortItemsByOrder } from "@/lib/crm/carnet";
import {
  IMPORT_AGENCY_NOTE,
  IMPORT_DOCUMENTS_NOTE,
  IMPORT_QUOTE_NOTE,
} from "@/lib/crm/email-detach";
import { activeCardDateRange, cancellationApplyPlan, cardStaysShown, replacementPlan } from "@/lib/crm/item-lifecycle";
import { findHotelBookingCard, findMatchingItem, keptHotelStayFields } from "@/lib/crm/item-match";
import { persistBookingCardOrder } from "@/lib/crm/item-order";
import { inferAirlineIata } from "@/lib/crm/brand-marks";
import {
  BookingIssuesError,
  collectExtractIssues,
  issuesSummary,
  zodIssuesToBookingIssues,
} from "@/lib/crm/booking-issues";
import {
  applyRoomGuestLabels,
  attachTravelerToHousehold,
  householdMembers,
} from "@/lib/crm/household";
import { isPlaceholderTraveler, sameRecordedTraveler } from "@/lib/crm/person-match";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import { foldLetters } from "@/lib/crm/text";
import {
  countsAsCarnetCard,
  isActiveItem,
  INGEST_ITEM_KINDS,
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

export async function cleanupIngestBatch(staffUserId: string, batchId: string) {
  try {
    const prefix = ingestBatchPrefix(staffUserId, batchId);
    const paths = await listCrmFiles(prefix);
    await removeCrmFiles(paths);
  } catch (err) {
    console.error("[ingest-tmp] cleanup", err instanceof Error ? err.message : err);
  }
}

export function matchCustomerId(
  customers: Pick<CrmCustomer, "id" | "email" | "first_name" | "last_name">[],
  extract: BookingExtract
) {
  const email = extract.customer_email?.trim().toLowerCase();
  if (email) {
    const hit = customers.find((c) => (c.email || "").toLowerCase() === email);
    if (hit) return hit.id;
  }
  const last = foldLetters(extract.customer_last_name);
  const first = foldLetters(extract.customer_first_name);
  if (!last) return null;
  const hits = customers.filter((c) => {
    if (foldLetters(c.last_name) !== last) return false;
    if (!first) return true;
    const cf = foldLetters(c.first_name);
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
            const rec: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
              if (k === "party_keys" && Array.isArray(v)) {
                const keys = v.map((key) => String(key || "")).filter(Boolean);
                if (keys.length) rec.party_keys = keys;
                continue;
              }
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
  return (INGEST_ITEM_KINDS as readonly string[]).includes(value || "")
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
  docs: UploadedDoc[],
  emailIngestId?: string,
  opts?: {
    keepSellingPrice?: boolean;
    replacements?: { itemId: string; kind: string; amount: number | null; includeInLedger: boolean }[];
  }
) {
  const remaining = [...existingItems];
  const createdIds: string[] = [];
  let sort = existingItems.reduce((max, row) => Math.max(max, row.sort_order || 0), -1) + 1;
  const ordered = sortItemsByOrder(extract.items || []);
  let saved = 0;
  let lastError = "";
  const consumedReplacements = new Set<string>();

  for (const raw of ordered) {
    const item = raw.kind === "hotel" ? normalizeHotelExtractItem(raw) : raw;
    const title = String(item.title || "").trim();
    if (!title) continue;
    const kind = itemKind(item.kind);
    const details = cleanDetails(item.details);
    if (item.confirmation_ref && !details.pnr) details.pnr = item.confirmation_ref;
    if (kind === "flight") {
      const iata = inferAirlineIata({
        airline: typeof details.airline === "string" ? details.airline : null,
        airline_iata: typeof details.airline_iata === "string" ? details.airline_iata : null,
        flight_number: typeof details.flight_number === "string" ? details.flight_number : null,
      });
      if (iata) details.airline_iata = iata;
      const named = (extract.travelers || []).filter(
        (row) =>
          (row.first_name || row.last_name) &&
          !isPlaceholderTraveler(row.first_name, row.last_name)
      );
      if (named.length && !Array.isArray(details.passengers)) {
        details.passengers = named.map((row) => ({
          first_name: row.first_name,
          last_name: row.last_name,
        }));
      }
    }
    if (kind === "hotel" && Array.isArray(details.rooms)) {
      details.rooms = applyRoomGuestLabels(
        details.rooms as { guests?: string; party_keys?: string[] }[],
        householdMembers(customer, companions)
      );
    }
    const pool = opts?.keepSellingPrice ? remaining.filter((row) => isActiveItem(row)) : remaining;
    const probe = {
      kind,
      confirmation_ref: emptyToNull(item.confirmation_ref),
      start_at: emptyToNull(item.start_at),
      title,
      details,
    };
    let match = findMatchingItem(pool, probe);
    let sameBooking = false;
    if (!match && opts?.keepSellingPrice) {
      match = findHotelBookingCard(pool, probe);
      sameBooking = Boolean(match);
    }
    const incomingAmount = parseMoney(item.amount);
    const replacing =
      !match && opts?.replacements
        ? opts.replacements.find((row) => row.kind === kind && !consumedReplacements.has(row.itemId))
        : undefined;
    if (replacing) consumedReplacements.add(replacing.itemId);
    const amount = opts?.keepSellingPrice
      ? match
        ? parseMoney(match.amount)
        : replacing
          ? parseMoney(replacing.amount)
          : null
      : incomingAmount != null
        ? incomingAmount
        : match
          ? parseMoney(match.amount)
          : null;
    const kept = sameBooking && match ? keptHotelStayFields(match, {
      title,
      confirmation_ref: emptyToNull(item.confirmation_ref),
      supplier: emptyToNull(item.supplier),
      start_at: emptyToNull(item.start_at),
      end_at: emptyToNull(item.end_at),
      details,
    }) : null;
    const payload = {
      kind,
      title: kept?.title || title,
      supplier: kept ? kept.supplier : emptyToNull(item.supplier),
      confirmation_ref: kept ? kept.confirmation_ref : emptyToNull(item.confirmation_ref),
      start_at: kept ? kept.start_at : emptyToNull(item.start_at),
      end_at: kept ? kept.end_at : emptyToNull(item.end_at),
      amount,
      details: kept?.details || details,
      visible_to_client: cardStaysShown(match, Boolean(opts?.keepSellingPrice)),
      source_document_id: sourceDocId(details, docs),
      ...(replacing
        ? { include_in_ledger: replacing.includeInLedger }
        : typeof item.include_in_ledger === "boolean"
          ? { include_in_ledger: item.include_in_ledger }
          : {}),
    };
    try {
      if (match) {
        const { error } = await supabase
          .from("crm_booking_items")
          .update(payload)
          .eq("id", match.id);
        if (error) throw dbFailure(error, "Carte non mise à jour.");
        Object.assign(match, payload);
        if (payload.source_document_id) {
          await supabase
            .from("crm_booking_documents")
            .update({ booking_item_id: match.id })
            .eq("id", payload.source_document_id)
            .eq("booking_id", bookingId);
        }
      } else {
        const insertedDetails = emailIngestId
          ? { ...details, email_ingest_id: emailIngestId }
          : details;
        const { data: inserted, error } = await supabase
          .from("crm_booking_items")
          .insert({
            booking_id: bookingId,
            sort_order: sort++,
            ...payload,
            details: insertedDetails,
          })
          .select("id")
          .single();
        if (error) throw dbFailure(error, "Carte non enregistrée.");
        if (inserted?.id) {
          createdIds.push(inserted.id);
          if (replacing) {
            const { error: retireError } = await supabase
              .from("crm_booking_items")
              .update({
                lifecycle: "superseded",
                superseded_by: inserted.id,
                visible_to_client: false,
                include_in_ledger: false,
              })
              .eq("id", replacing.itemId)
              .eq("booking_id", bookingId);
            if (retireError) throw dbFailure(retireError, "Ancienne carte non archivée.");
            const retired = remaining.find((row) => row.id === replacing.itemId);
            if (retired) {
              retired.lifecycle = "superseded";
              retired.include_in_ledger = false;
              retired.visible_to_client = false;
            }
          }
          remaining.push({
            id: inserted.id,
            booking_id: bookingId,
            sort_order: sort - 1,
            created_at: "",
            updated_at: "",
            ...payload,
            details: insertedDetails,
          } as CrmBookingItem);
          if (payload.source_document_id) {
            await supabase
              .from("crm_booking_documents")
              .update({ booking_item_id: inserted.id })
              .eq("id", payload.source_document_id)
              .eq("booking_id", bookingId);
          }
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
    const linked = attachTravelerToHousehold(traveler, customer, companions);
    const first = emptyToNull(linked.first_name);
    const last = emptyToNull(linked.last_name);
    if (!first && !last) continue;
    if (skipPlaceholders && isPlaceholderTraveler(first, last)) continue;
    const recorded = { first_name: first, last_name: last };
    if (existingTravelers.some((row) => sameRecordedTraveler(row, recorded))) continue;
    const companion =
      linked.companion_id ? companions.find((row) => row.id === linked.companion_id) : null;
    const { error } = await supabase.from("crm_booking_travelers").insert({
      booking_id: bookingId,
      companion_id: companion?.id || null,
      is_account_holder: Boolean(linked.is_account_holder),
      first_name: first || companion?.first_name || null,
      last_name: last || companion?.last_name || null,
    });
    if (error) throw dbFailure(error, "Voyageur non enregistré.");
    existingTravelers.push(recorded);
  }

  await reconcileCustomerParty(customer.id, supabase);
  if (saved) {
    try {
      await persistBookingCardOrder(supabase, bookingId, { createdIds });
    } catch (error) {
      throw dbFailure(error as { message?: string; code?: string }, "Ordre des cartes non enregistré.");
    }
  }
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
  /** Mail source : tamponné sur les cartes créées, pour pouvoir les remettre dans la file. */
  emailIngestId?: string;
}) {
  const admin = createServiceClient();
  const [{ data: customer }, { data: companions }] = await Promise.all([
    admin.from("crm_customers").select("*").eq("id", opts.customerId).maybeSingle(),
    admin.from("crm_travel_companions").select("*").eq("customer_id", opts.customerId),
  ]);
  if (!customer) {
    throw new BookingIssuesError("Client introuvable", [
      { field: "customer_id", message: "Client introuvable." },
    ]);
  }
  if (isCancellationExtract(opts.extract)) {
    throw new BookingIssuesError("Annulation : rattachez à un voyage existant.", [
      {
        field: "document_status",
        message: "Annulation : ne créez pas un nouveau dossier.",
      },
    ]);
  }
  const persistIssues = collectExtractIssues(opts.extract, {
    customerId: opts.customerId,
    requireCustomer: true,
  });
  if (persistIssues.length) throw new BookingIssuesError(issuesSummary(persistIssues), persistIssues);
  const reference = await nextBookingReference(opts.referenceClient ?? admin);
  const walletId = resolveBillingCustomerId(customer as CrmCustomer);
  const { data: companyRows } = await admin
    .from("crm_billing_companies")
    .select("id, sort_order")
    .eq("customer_id", walletId)
    .order("sort_order");
  const payer = defaultPayer((companyRows || []) as { id: string; sort_order: number }[]);
  const extract = opts.extract;
  const title = dossierTitle(extract);
  const totalAmount = sellingTotalFromExtract(extract);
  const status = bookingStatusFromExtract(extract, opts.status);
  const { data, error } = await admin
    .from("crm_bookings")
    .insert({
      customer_id: opts.customerId,
      billing_customer_id: walletId,
      billing_company_id: payer.billing_company_id,
      payer_kind: payer.payer_kind,
      reference,
      title,
      destination: emptyToNull(extract.destination),
      status,
      start_date: emptyToNull(extract.start_date),
      end_date: emptyToNull(extract.end_date),
      currency: bookingCurrencyFromReview(extract.currency, extract.items),
      total_amount: totalAmount,
      notes_client: emptyToNull(extract.notes_client),
      notes_internal:
        extract.document_status === "quote"
          ? IMPORT_QUOTE_NOTE
          : (opts.staged?.length || opts.files?.length)
            ? IMPORT_DOCUMENTS_NOTE
            : IMPORT_AGENCY_NOTE,
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
    docs,
    opts.emailIngestId
  );
  await syncBookingTitleFromSteps(admin, booking.id);
  await syncBookingTotalFromItems(admin, booking.id);
  const { data: withTotal } = await admin
    .from("crm_bookings")
    .select("*")
    .eq("id", booking.id)
    .maybeSingle();
  const booked = (withTotal || booking) as CrmBooking;
  await syncBookingLedger(admin, booked);
  return booked;
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
  /** Relecture du formulaire : titre et devise choisis, pas ceux du PDF. */
  applyStayFields?: boolean;
  /** Mail source : tamponné sur les cartes créées, pour pouvoir les remettre dans la file. */
  emailIngestId?: string;
  /** Le montant du mail ne remplace pas le prix vendu. */
  keepSellingPrice?: boolean;
  replacements?: { itemId: string; kind: string; amount: number | null; includeInLedger: boolean }[];
  /** Un dossier annulé redevient confirmé, sans être montré. */
  reopenIfCancelled?: boolean;
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
  if (!customer) throw new BookingIssuesError("Client introuvable", [
    { field: "customer_id", message: "Client introuvable." },
  ]);
  if (opts.reopenIfCancelled && booking.status === "cancelled") {
    const { error } = await admin
      .from("crm_bookings")
      .update({ status: "confirmed", visible_to_client: false })
      .eq("id", opts.bookingId);
    if (error) throw dbFailure(error, "Séjour non rouvert.");
    booking.status = "confirmed";
    booking.visible_to_client = false;
  }
  const persistIssues = collectExtractIssues(opts.extract);
  if (persistIssues.length) throw new BookingIssuesError(issuesSummary(persistIssues), persistIssues);
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
    docs,
    opts.emailIngestId,
    { keepSellingPrice: opts.keepSellingPrice, replacements: opts.replacements }
  );
  const patch: Record<string, unknown> = {};
  const chosenTitle = emptyToNull(opts.extract.title);
  if (opts.applyStayFields && chosenTitle) patch.title = chosenTitle;
  else if (!booking.title && chosenTitle) patch.title = chosenTitle;
  if (opts.applyStayFields) {
    patch.currency = bookingCurrencyFromReview(opts.extract.currency, opts.extract.items);
  }
  if (!booking.destination && opts.extract.destination) patch.destination = opts.extract.destination;
  if (opts.keepSellingPrice) {
    const { data: dated } = await admin
      .from("crm_booking_items")
      .select("kind, start_at, end_at, lifecycle")
      .eq("booking_id", opts.bookingId);
    const range = activeCardDateRange(dated || []);
    if (range.start) patch.start_date = range.start;
    if (range.end) patch.end_date = range.end;
  } else {
    if (!booking.start_date && opts.extract.start_date) patch.start_date = opts.extract.start_date;
    if (!booking.end_date && opts.extract.end_date) patch.end_date = opts.extract.end_date;
  }
  if (booking.status === "draft" && opts.extract.document_status === "confirmed") {
    patch.status = "confirmed";
  }
  if (Object.keys(patch).length) {
    await admin.from("crm_bookings").update(patch).eq("id", opts.bookingId);
  }
  await syncBookingTitleFromSteps(admin, opts.bookingId);
  await syncBookingTotalFromItems(admin, opts.bookingId);
  const { data: refreshed } = await admin
    .from("crm_bookings")
    .select("*")
    .eq("id", opts.bookingId)
    .maybeSingle();
  const next = (refreshed || booking) as CrmBooking;
  await syncBookingLedger(admin, next, booking.status as BookingStatus);
  return next;
}

/** Confirmation sur un dossier déjà là : met à jour ou remplace, sans deuxième dossier. */
export async function applyReplacementToBooking(opts: {
  bookingId: string;
  customerId: string;
  extract: BookingExtract;
  files?: File[];
  staged?: IngestStagedFile[];
  staffUserId?: string;
  batchId?: string;
  visibleToClient: boolean;
  applyStayFields?: boolean;
  emailIngestId?: string;
  replaceItemId?: string | null;
}) {
  const admin = createServiceClient();
  const { data: items } = await admin
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", opts.bookingId);
  const plan = replacementPlan(
    opts.extract.items || [],
    (items || []) as CrmBookingItem[],
    opts.replaceItemId
  );
  if (plan.choices.length) {
    throw new BookingIssuesError("Choisissez la carte à remplacer.", [
      { field: "item_id", message: "Choisissez la carte à remplacer." },
    ]);
  }
  return applyExtractToBooking({
    ...opts,
    keepSellingPrice: true,
    replacements: plan.replacements,
    reopenIfCancelled: true,
  });
}

/** Annulation fournisseur : retire les cartes reconnues. Le dossier n’est annulé que s’il ne reste plus de carte. */
export async function applyCancellationToBooking(opts: {
  bookingId: string;
  customerId: string;
  extract: BookingExtract;
  files?: File[];
  staged?: IngestStagedFile[];
  staffUserId?: string;
  batchId?: string;
  visibleToClient: boolean;
  itemId?: string | null;
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
  const { data: items } = await admin
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", opts.bookingId);
  const rows = (items || []) as CrmBookingItem[];
  await attachBookingFiles(
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
  const plan = cancellationApplyPlan(opts.extract, rows);
  let itemIds = plan.itemIds;
  let cancelBooking = plan.cancelBooking;
  if (opts.itemId) {
    const target = rows.find((row) => row.id === opts.itemId && isActiveItem(row));
    if (!target) {
      throw new BookingIssuesError("Choisissez la carte à annuler.", [
        { field: "item_id", message: "Choisissez une carte encore active." },
      ]);
    }
    itemIds = [target.id];
    const leftover = rows.filter(
      (row) => row.id !== target.id && isActiveItem(row) && countsAsCarnetCard(row.kind)
    );
    cancelBooking = leftover.length === 0;
  } else if (plan.needsCardChoice) {
    throw new BookingIssuesError("Choisissez la carte à annuler.", [
      { field: "item_id", message: "Choisissez la carte à annuler." },
    ]);
  }
  for (const itemId of itemIds) {
    const { error } = await admin
      .from("crm_booking_items")
      .update({ lifecycle: "cancelled", visible_to_client: false, include_in_ledger: false })
      .eq("id", itemId)
      .eq("booking_id", opts.bookingId);
    if (error) throw dbFailure(error, "Carte non mise à jour.");
  }
  const note = "Annulation fournisseur appliquée.";
  const patch: Record<string, unknown> = {};
  if (cancelBooking && booking.status !== "cancelled") {
    patch.status = "cancelled";
  }
  const previousNotes = String(booking.notes_internal || "").trim();
  if (itemIds.length && !previousNotes.includes(note)) {
    patch.notes_internal = previousNotes ? `${previousNotes}\n${note}` : note;
  }
  if (itemIds.length && !cancelBooking) {
    const { data: dated } = await admin
      .from("crm_booking_items")
      .select("kind, start_at, end_at, lifecycle")
      .eq("booking_id", opts.bookingId);
    const range = activeCardDateRange(dated || []);
    if (range.start) patch.start_date = range.start;
    if (range.end) patch.end_date = range.end;
  }
  if (Object.keys(patch).length) {
    const { error } = await admin.from("crm_bookings").update(patch).eq("id", opts.bookingId);
    if (error) throw dbFailure(error, "Annulation non enregistrée.");
  }
  await syncBookingTotalFromItems(admin, opts.bookingId);
  const { data: refreshed } = await admin
    .from("crm_bookings")
    .select("*")
    .eq("id", opts.bookingId)
    .maybeSingle();
  const next = (refreshed || booking) as CrmBooking;
  await syncBookingLedger(admin, next, booking.status as BookingStatus);
  return next;
}

export function parseExtractPayload(raw: unknown): BookingExtract {
  const parsed = bookingExtractSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = zodIssuesToBookingIssues(parsed.error);
    console.error(
      "[ingest] extract_invalid",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      }))
    );
    throw new BookingIssuesError(issuesSummary(issues) || "Données extraites invalides", issues);
  }
  return keepAgentPrices(parsed.data);
}

function dbFailure(error: DbErrorLike, fallback: string) {
  console.error("[ingest] db:", error?.code ?? "?", error?.message ?? "");
  return new Error(dbErrorMessage(error, fallback));
}
