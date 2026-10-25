import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "./audit-events";
import { downloadActivityPath } from "./customer-activity";
import { greetingGivenName } from "./identity";

/** Pièce d’identité : le journal ne dit que le type et le prénom. */
const IDENTITY_KINDS = new Set(["passport", "id_card", "visa", "eta"]);

const IDENTITY_LABELS: Record<string, string> = {
  passport: "Passeport",
  id_card: "Carte d'identité",
  visa: "Visa",
  eta: "Autorisation de voyage",
};

const ITEM_LABELS: Record<string, string> = {
  flight: "Billet",
  hotel: "Hôtel",
  transfer: "Transfert",
  activity: "Activité",
  rail: "Train",
  car: "Voiture",
  cruise: "Bateau",
  insurance: "Assurance",
  fee: "Frais",
  visa: "Visa",
  invoice: "Facture",
  checkin: "Enregistrement",
  accueil_vip: "Accueil",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATH_RE = /^download\/([0-9a-f]{8})$/;
const UUID_PATH_RE = /^download\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** MRZ, passeport français (12AB34567), numéro à lettres puis chiffres, longue suite de chiffres. */
function stripPieceSecrets(value: string) {
  return value
    .replace(/[A-Z0-9<]{20,}/gi, " ")
    .replace(/\b\d{2}[A-Z]{2}\d{5}\b/gi, " ")
    .replace(/\b[A-Z]{1,2}\d{6,9}\b/gi, " ")
    .replace(/\b\d{6,}\b/g, " ");
}

export type DownloadTable = "crm_booking_documents" | "crm_travel_documents";

export type DownloadRecord = {
  summary: string;
  path: string;
  bookingId: string | null;
  customerId: string | null;
  documentId: string;
  documentTable: DownloadTable;
  documentKind: string;
  documentName: string;
};

export type PieceSource = {
  id: string;
  table: DownloadTable;
  storagePath: string | null;
  kind: string;
  fileName: string | null;
  firstName: string | null;
  bookingId: string | null;
  reference: string | null;
  itemKind?: string | null;
  customerId?: string | null;
};

export type DownloadRepairRow = {
  id: string;
  customer_id: string;
  summary: string;
  path: string | null;
  booking_id?: string | null;
  document_id?: string | null;
};

/** Huit caractères hex : hash du chemin, pas un identifiant de pièce. */
export function hashedDownloadKey(path: string | null | undefined) {
  const match = path?.match(HASH_PATH_RE);
  return match ? match[1] : null;
}

export function downloadDocumentId(path: string | null | undefined) {
  const match = path?.match(UUID_PATH_RE);
  return match ? match[1].toLowerCase() : null;
}

/** Ancienne phrase, avant que le journal nomme la pièce. */
export function vagueDownloadSummary(summary: string) {
  return (
    summary === "A téléchargé une pièce" ||
    summary === "A téléchargé un document" ||
    summary.startsWith("A téléchargé un document du séjour ")
  );
}

/** Retire l’extension et tout jeton qui peut être un numéro de pièce ou une MRZ. */
export function sanitizeDownloadFileName(fileName: string | null | undefined) {
  if (!fileName) return null;
  const base = fileName.split(/[/\\]/).pop() || "";
  const noExt = base.replace(/\.(pdf|jpe?g|png|webp|heic|heif|docx?|xlsx?|eml|txt)$/i, "");
  const cleaned = stripPieceSecrets(noExt)
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s._-]+|[\s._-]+$/g, "")
    .trim();
  if (cleaned.replace(/[^\p{L}\p{N}]/gu, "").length < 3) return null;
  return cleaned.slice(0, 140);
}

function fallbackLabel(kind: string, itemKind?: string | null) {
  if (kind === "invoice" || itemKind === "invoice") return "Facture";
  if (itemKind && ITEM_LABELS[itemKind]) return ITEM_LABELS[itemKind];
  if (kind === "insurance") return "Assurance";
  if (IDENTITY_LABELS[kind]) return IDENTITY_LABELS[kind];
  return "Document";
}

function identityTitle(kind: string, firstName: string | null | undefined) {
  const label = IDENTITY_LABELS[kind] || "Pièce";
  const given = greetingGivenName(firstName);
  return given ? `${label} de ${given}` : label;
}

function withReference(title: string, reference: string | null | undefined) {
  const ref = (reference || "").trim();
  if (!ref || title.includes(ref)) return title;
  return `${title} (${ref})`;
}

/** Phrase du journal et colonnes sûres. Un passeport ne porte ni numéro, ni MRZ, ni nom de fichier. */
export function describeDownload(input: {
  id: string;
  table: DownloadTable;
  kind: string;
  fileName?: string | null;
  firstName?: string | null;
  bookingId?: string | null;
  reference?: string | null;
  itemKind?: string | null;
  customerId?: string | null;
}): DownloadRecord {
  const identity = input.table === "crm_travel_documents" && IDENTITY_KINDS.has(input.kind);
  const documentName = identity
    ? identityTitle(input.kind, input.firstName)
    : sanitizeDownloadFileName(input.fileName) || fallbackLabel(input.kind, input.itemKind);
  const title = identity ? documentName : withReference(documentName, input.reference);
  const summary = `A téléchargé : ${title}`.replace(/\s+/g, " ").trim().slice(0, 180);
  const path = downloadActivityPath(input.id) || `download/${input.id}`;
  return {
    summary,
    path,
    bookingId: input.bookingId || null,
    customerId: input.customerId || null,
    documentId: input.id,
    documentTable: input.table,
    documentKind: (input.table === "crm_travel_documents"
    ? input.kind
    : input.kind === "invoice"
      ? "invoice"
      : input.itemKind || input.kind
  ).slice(0, 40),
    documentName: documentName.slice(0, 180),
  };
}

/**
 * Ancienne ligne `download/` + 8 hex, ou `download/` + uuid.
 * Un seul document dont le chemin (ou l’id) correspond. Zéro ou plusieurs : on ne touche pas.
 */
export function planDownloadRepair(
  row: { path: string | null; summary: string; documentId?: string | null },
  pieces: PieceSource[]
): PieceSource | null {
  if (row.documentId) return null;
  if (row.summary === "A téléchargé un relevé") return null;
  const hashed = hashedDownloadKey(row.path);
  if (hashed) {
    if (!vagueDownloadSummary(row.summary)) return null;
    const table: DownloadTable =
      row.summary === "A téléchargé une pièce" ? "crm_travel_documents" : "crm_booking_documents";
    const hits = pieces.filter(
      (piece) =>
        piece.table === table &&
        piece.storagePath &&
        downloadActivityPath(piece.storagePath) === row.path
    );
    return hits.length === 1 ? hits[0] : null;
  }
  const id = downloadDocumentId(row.path);
  if (!id) return null;
  const hits = pieces.filter((piece) => piece.id.toLowerCase() === id);
  return hits.length === 1 ? hits[0] : null;
}

type DbError = { code?: string | null; message?: string | null } | null;

function missingDocumentColumn(error: DbError) {
  if (!error) return false;
  const message = error.message || "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /document_id|document_table|document_kind|document_name/.test(message)
  );
}

let documentColumns: "yes" | "no" | "unknown" = "unknown";

function asPieces(
  table: DownloadTable,
  rows: Record<string, unknown>[],
  references: Map<string, string>,
  customers: Map<string, string>,
  itemKinds: Map<string, string>
): PieceSource[] {
  const pieces: PieceSource[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!UUID_RE.test(id)) continue;
    const bookingId = typeof row.booking_id === "string" ? row.booking_id : null;
    const itemId = typeof row.booking_item_id === "string" ? row.booking_item_id : null;
    pieces.push({
      id,
      table,
      storagePath: typeof row.storage_path === "string" ? row.storage_path : null,
      kind: typeof row.doc_type === "string" ? row.doc_type : typeof row.kind === "string" ? row.kind : "other",
      fileName: typeof row.file_name === "string" ? row.file_name : null,
      firstName: typeof row.first_name === "string" ? row.first_name : null,
      bookingId,
      reference: bookingId ? references.get(bookingId) || null : null,
      itemKind: itemId ? itemKinds.get(itemId) || null : null,
      customerId: typeof row.customer_id === "string" ? row.customer_id : bookingId ? customers.get(bookingId) || null : null,
    });
  }
  return pieces;
}

async function loadPieces(admin: SupabaseClient, customerId: string) {
  const stays = await admin.from("crm_bookings").select("id, reference, customer_id").eq("customer_id", customerId);
  const references = new Map<string, string>();
  const customers = new Map<string, string>();
  const stayIds: string[] = [];
  for (const stay of (stays.data || []) as Record<string, unknown>[]) {
    if (typeof stay.id !== "string") continue;
    stayIds.push(stay.id);
    if (typeof stay.reference === "string") references.set(stay.id, stay.reference);
    if (typeof stay.customer_id === "string") customers.set(stay.id, stay.customer_id);
  }
  const travel = await admin
    .from("crm_travel_documents")
    .select("id, customer_id, booking_id, doc_type, file_name, first_name, storage_path")
    .eq("customer_id", customerId)
    .not("storage_path", "is", null);
  const bookingDocs = stayIds.length
    ? await admin
        .from("crm_booking_documents")
        .select("id, booking_id, kind, file_name, booking_item_id, storage_path")
        .in("booking_id", stayIds)
    : { data: [] as Record<string, unknown>[] };
  const itemIds = [
    ...new Set(
      ((bookingDocs.data || []) as Record<string, unknown>[])
        .map((row) => (typeof row.booking_item_id === "string" ? row.booking_item_id : ""))
        .filter((id) => UUID_RE.test(id))
    ),
  ];
  const itemKinds = new Map<string, string>();
  if (itemIds.length) {
    const items = await admin.from("crm_booking_items").select("id, kind").in("id", itemIds);
    for (const item of (items.data || []) as { id?: string; kind?: string }[]) {
      if (item.id && item.kind) itemKinds.set(item.id, item.kind);
    }
  }
  return [
    ...asPieces("crm_travel_documents", (travel.data || []) as Record<string, unknown>[], references, customers, itemKinds),
    ...asPieces("crm_booking_documents", (bookingDocs.data || []) as Record<string, unknown>[], references, customers, itemKinds),
  ];
}

async function readRepairRows(admin: SupabaseClient, customerIds: string[]): Promise<DownloadRepairRow[]> {
  const base = admin
    .from("crm_customer_activity")
    .select(
      documentColumns === "no"
        ? "id, customer_id, summary, path, booking_id"
        : "id, customer_id, summary, path, booking_id, document_id"
    )
    .in("customer_id", customerIds)
    .eq("action", "download")
    .order("created_at", { ascending: false })
    .limit(400);
  const first = await base;
  if (!first.error) {
    if (documentColumns !== "no") documentColumns = "yes";
    return (first.data || []) as DownloadRepairRow[];
  }
  if (!missingDocumentColumn(first.error)) return [];
  documentColumns = "no";
  const second = await admin
    .from("crm_customer_activity")
    .select("id, customer_id, summary, path, booking_id")
    .in("customer_id", customerIds)
    .eq("action", "download")
    .order("created_at", { ascending: false })
    .limit(400);
  if (second.error) return [];
  return (second.data || []) as DownloadRepairRow[];
}

/**
 * Réécrit les anciennes lignes quand une seule pièce correspond.
 * Le hash est celui qui a créé `download/ea25491d` : on ne le refait pas en SQL.
 */
export async function repairCustomerDownloads(customerIds: string[]) {
  const patches = new Map<string, { summary: string; bookingId: string | null }>();
  const ids = [...new Set(customerIds.map((id) => id.trim().toLowerCase()).filter((id) => UUID_RE.test(id)))];
  if (!ids.length) return patches;
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const admin = createServiceClient();
    const rows = await readRepairRows(admin, ids);
    const pending = rows.filter((row) => {
      if (row.document_id) return false;
      if (row.summary === "A téléchargé un relevé") return false;
      if (hashedDownloadKey(row.path)) return vagueDownloadSummary(row.summary);
      if (downloadDocumentId(row.path)) return documentColumns !== "no" || vagueDownloadSummary(row.summary);
      return false;
    });
    const byCustomer = new Map<string, DownloadRepairRow[]>();
    for (const row of pending) {
      const list = byCustomer.get(row.customer_id) || [];
      list.push(row);
      byCustomer.set(row.customer_id, list);
    }
    for (const [customerId, customerRows] of byCustomer) {
      const pieces = await loadPieces(admin, customerId);
      for (const row of customerRows) {
        const piece = planDownloadRepair(
          { path: row.path, summary: row.summary, documentId: row.document_id },
          pieces
        );
        if (!piece) continue;
        const described = describeDownload({ ...piece, customerId });
        const same =
          row.summary === described.summary &&
          row.path === described.path &&
          (row.booking_id || null) === described.bookingId;
        const columns = documentColumns === "no"
          ? null
          : {
              document_id: described.documentId,
              document_table: described.documentTable,
              document_kind: described.documentKind,
              document_name: described.documentName,
            };
        if (same && !columns) continue;
        const payload = {
          summary: described.summary,
          path: described.path,
          booking_id: described.bookingId,
          ...(columns || {}),
        };
        const updated = await admin.from("crm_customer_activity").update(payload).eq("id", row.id).eq("customer_id", customerId);
        if (updated.error && columns && missingDocumentColumn(updated.error)) {
          documentColumns = "no";
          if (same) continue;
          const retry = await admin
            .from("crm_customer_activity")
            .update({ summary: described.summary, path: described.path, booking_id: described.bookingId })
            .eq("id", row.id)
            .eq("customer_id", customerId);
          if (retry.error) continue;
        } else if (updated.error) {
          continue;
        }
        patches.set(row.id, { summary: described.summary, bookingId: described.bookingId });
      }
    }
  } catch {
    console.error("[download-journal] reprise impossible");
  }
  return patches;
}

function customerIdFromPath(path: string) {
  const match = path.match(/^customers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
  return match ? match[1].toLowerCase() : null;
}

function bookingIdFromPath(path: string) {
  const match = path.match(/^bookings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
  return match ? match[1].toLowerCase() : null;
}

async function referenceFor(supabase: SupabaseClient, bookingId: string | null) {
  if (!bookingId) return { reference: null as string | null, customerId: null as string | null };
  const { data } = await supabase.from("crm_bookings").select("reference, customer_id").eq("id", bookingId).maybeSingle();
  return {
    reference: typeof data?.reference === "string" ? data.reference : null,
    customerId: typeof data?.customer_id === "string" ? data.customer_id : null,
  };
}

async function itemKindFor(supabase: SupabaseClient, itemId: unknown, fileName: unknown) {
  if (typeof itemId !== "string" || !UUID_RE.test(itemId)) return null;
  if (sanitizeDownloadFileName(typeof fileName === "string" ? fileName : null)) return null;
  const { data } = await supabase.from("crm_booking_items").select("kind").eq("id", itemId).maybeSingle();
  return typeof data?.kind === "string" ? data.kind : null;
}

/** Retrouve la pièce derrière un chemin storage. Plusieurs lignes : rien, on ne devine pas. */
export async function lookupDownloadPiece(
  supabase: SupabaseClient,
  storagePath: string
): Promise<DownloadRecord | { summary: string; path: string; bookingId: null; customerId: string } | null> {
  const releve = storagePath.match(
    /^customers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/releves\//i
  );
  if (releve) {
    return {
      summary: "A téléchargé un relevé",
      path: downloadActivityPath(storagePath) || "download/releve",
      bookingId: null,
      customerId: releve[1].toLowerCase(),
    };
  }
  const ownerId = customerIdFromPath(storagePath);
  if (ownerId && /^customers\/[0-9a-f-]{36}\/documents\//i.test(storagePath)) {
    const { data, error } = await supabase
      .from("crm_travel_documents")
      .select("id, customer_id, booking_id, doc_type, file_name, first_name")
      .eq("customer_id", ownerId)
      .eq("storage_path", storagePath)
      .limit(2);
    if (error || !data || data.length !== 1) return null;
    const row = data[0] as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!UUID_RE.test(id)) return null;
    const bookingId = typeof row.booking_id === "string" ? row.booking_id : null;
    const stay = await referenceFor(supabase, bookingId);
    return describeDownload({
      id,
      table: "crm_travel_documents",
      kind: typeof row.doc_type === "string" ? row.doc_type : "other",
      fileName: typeof row.file_name === "string" ? row.file_name : null,
      firstName: typeof row.first_name === "string" ? row.first_name : null,
      bookingId,
      reference: stay.reference,
      customerId: ownerId,
    });
  }
  const bookingId = bookingIdFromPath(storagePath);
  if (!bookingId) return null;
  const { data, error } = await supabase
    .from("crm_booking_documents")
    .select("id, booking_id, kind, file_name, booking_item_id")
    .eq("booking_id", bookingId)
    .eq("storage_path", storagePath)
    .limit(2);
  if (error || !data || data.length !== 1) return null;
  const row = data[0] as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!UUID_RE.test(id)) return null;
  const stay = await referenceFor(supabase, bookingId);
  const itemKind = await itemKindFor(supabase, row.booking_item_id, row.file_name);
  return describeDownload({
    id,
    table: "crm_booking_documents",
    kind: typeof row.kind === "string" ? row.kind : "pdf",
    fileName: typeof row.file_name === "string" ? row.file_name : null,
    bookingId,
    reference: stay.reference,
    itemKind,
    customerId: stay.customerId,
  });
}

export function staffDownloadAudit(input: {
  staffId: string;
  customerId?: string | null;
  bookingId?: string | null;
  summary: string;
  documentId?: string | null;
  documentTable?: string | null;
  documentKind?: string | null;
  documentName?: string | null;
}) {
  const detail = input.documentId
    ? {
        document_id: input.documentId,
        document_table: input.documentTable || null,
        document_kind: input.documentKind || null,
        document_name: input.documentName || null,
      }
    : {};
  return toAuditRow({
    actorKind: "human",
    actorId: input.staffId,
    action: "download",
    customerId: input.customerId,
    bookingId: input.bookingId,
    summary: input.summary,
    detail,
  });
}

/** Journal d’agence. Un aperçu, une vignette ou un lien public n’y entre pas. */
export async function recordStaffDownload(staffId: string, storagePath: string, supabase: SupabaseClient) {
  try {
    const found = await lookupDownloadPiece(supabase, storagePath);
    if (!found) return;
    const piece = "documentId" in found ? found : null;
    const row = staffDownloadAudit({
      staffId,
      customerId: found.customerId,
      bookingId: piece?.bookingId || null,
      summary: found.summary,
      documentId: piece?.documentId,
      documentTable: piece?.documentTable,
      documentKind: piece?.documentKind,
      documentName: piece?.documentName,
    });
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const admin = createServiceClient();
    const { error } = await admin.from("crm_audit_events").insert(row);
    if (error) console.error("[download-journal] audit impossible");
  } catch {
    console.error("[download-journal] audit impossible");
  }
}
