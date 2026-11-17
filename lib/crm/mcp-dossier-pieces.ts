import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PIECE_URL_SECONDS,
  pieceEstRetiree,
  pieceVue,
  readPieceArchive,
  withPieceArchive,
  withoutPieceArchive,
  type DossierPieceRow,
} from "@/lib/crm/dossier-piece";
import { crmFileSizes, downloadCrmFile, signedCrmUrl } from "@/lib/crm/files";
import { McpReadError } from "@/lib/crm/mcp-passport";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { missingDbColumn, queryWithOptionalColumn } from "@/lib/crm/optional-column";
import { redactIngestText } from "@/lib/crm/ingest-redact";
import { redactEmailReadText } from "@/lib/crm/mcp-email";
import { pdfPlainText } from "@/lib/crm/pdf-raster";
import { createServiceClient } from "@/lib/supabase/admin";

const PIECE_TEXT_CAP = 16_000;

export function pieceReadText(raw: string): { texte: string; tronque: boolean } | null {
  const clean = redactEmailReadText(redactIngestText(raw)).replace(/\u0000/g, "").trim();
  if (!clean) return null;
  if (clean.length > PIECE_TEXT_CAP) return { texte: clean.slice(0, PIECE_TEXT_CAP), tronque: true };
  return { texte: clean, tronque: false };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIRM = "Confirmation requise : confirmer true.";
const OTHER_DOSSIER = "Cette pièce n’est pas sur ce dossier.";
const RETIRED = "Cette pièce est retirée.";
const COLUMN_MISSING = "Le classement d’une pièce retirée n’est pas en place. Le fichier n’a pas été effacé.";

const PIECE_COLUMNS =
  "id, booking_id, booking_item_id, kind, file_name, mime_type, storage_path, visible_to_client, content_sha256, email_ingest_id, created_at";

type BookingHit = { id: string; reference: string };

type ItemRow = {
  id: string;
  kind?: string | null;
  title?: string | null;
  source_document_id?: string | null;
};

export type DossierPieceDeps = {
  admin?: SupabaseClient;
  findBooking?: (target: { id: string; reference: string }) => Promise<BookingHit>;
  now?: () => string;
  fileSizes?: (paths: string[]) => Promise<Map<string, number>>;
  readBytes?: (path: string) => Promise<{ bytes: Uint8Array; contentType: string }>;
  pdfText?: (bytes: Uint8Array) => Promise<{ text: string }>;
  signedUrl?: (path: string, expiresIn: number) => Promise<string>;
};

function text(value: unknown, max = 80) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function requireUuid(value: unknown, label: string) {
  const id = text(value, 80);
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

function dossierTarget(input: Record<string, unknown>) {
  const id = text(input.dossier_id, 80);
  const reference = text(input.reference, 80);
  if (id && !UUID.test(id)) throw new McpWriteError("Dossier invalide.");
  if (!id && !reference) throw new McpWriteError("Indiquez l’identifiant ou la référence du dossier.");
  return { id, reference };
}

function clientOf(deps: DossierPieceDeps): SupabaseClient {
  if (deps.admin) return deps.admin;
  return createServiceClient();
}

async function findBooking(admin: SupabaseClient, target: { id: string; reference: string }): Promise<BookingHit> {
  let query = admin.from("crm_bookings").select("id, reference");
  query = target.id ? query.eq("id", target.id) : query.eq("reference", target.reference);
  const { data, error } = await query.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const rows = (data || []) as BookingHit[];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0];
}

async function bookingOf(input: Record<string, unknown>, deps: DossierPieceDeps) {
  const target = dossierTarget(input);
  if (deps.findBooking) return deps.findBooking(target);
  return findBooking(clientOf(deps), target);
}

async function loadPieces(admin: SupabaseClient, bookingId: string): Promise<DossierPieceRow[]> {
  const result = await queryWithOptionalColumn(
    (columns) => admin.from("crm_booking_documents").select(columns).eq("booking_id", bookingId),
    PIECE_COLUMNS,
    "extracted"
  );
  if (result.error) throw new McpReadError("Pièces du dossier illisibles.");
  return ((result.data || []) as unknown) as DossierPieceRow[];
}

async function loadPiece(admin: SupabaseClient, documentId: string): Promise<DossierPieceRow | null> {
  const result = await queryWithOptionalColumn(
    (columns) => admin.from("crm_booking_documents").select(columns).eq("id", documentId).maybeSingle(),
    PIECE_COLUMNS,
    "extracted"
  );
  if (result.error) throw new McpReadError("Pièce illisible.");
  return (result.data as DossierPieceRow | null) || null;
}

async function loadItems(admin: SupabaseClient, bookingId: string): Promise<ItemRow[]> {
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, source_document_id")
    .eq("booking_id", bookingId);
  if (error) throw new McpReadError("Cartes du dossier illisibles.");
  return (data || []) as ItemRow[];
}

async function savePiece(
  admin: SupabaseClient,
  documentId: string,
  bookingId: string,
  patch: Record<string, unknown>
) {
  const { data, error } = await admin
    .from("crm_booking_documents")
    .update(patch)
    .eq("id", documentId)
    .eq("booking_id", bookingId)
    .select("id")
    .maybeSingle();
  if (error && Object.prototype.hasOwnProperty.call(patch, "extracted") && missingDbColumn(error, "extracted")) {
    throw new McpWriteError(COLUMN_MISSING);
  }
  if (error || !data) throw new McpWriteError("Pièce non enregistrée.");
}

function pieceOnBooking(piece: DossierPieceRow | null, bookingId: string, read: boolean) {
  if (!piece) throw new McpWriteError("Pièce introuvable.");
  if (piece.booking_id !== bookingId) throw new McpWriteError(OTHER_DOSSIER);
  if (!read && pieceEstRetiree(piece.extracted)) throw new McpWriteError(RETIRED);
  return piece;
}

export async function listerPiecesDossier(input: Record<string, unknown>, deps: DossierPieceDeps = {}) {
  const booking = await bookingOf(input, deps);
  const admin = clientOf(deps);
  const [pieces, items] = await Promise.all([loadPieces(admin, booking.id), loadItems(admin, booking.id)]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const sources = new Set(items.map((item) => item.source_document_id).filter((id): id is string => Boolean(id)));
  const includeRetired = input.inclure_retirees === true;
  const active = includeRetired ? pieces : pieces.filter((row) => !pieceEstRetiree(row.extracted));
  const paths = active.map((row) => row.storage_path).filter((path): path is string => Boolean(path));
  let sizes = new Map<string, number>();
  if (paths.length) {
    try {
      sizes = await (deps.fileSizes ?? crmFileSizes)(paths);
    } catch {
      sizes = new Map();
    }
  }
  const vues = active
    .map((row) =>
      pieceVue({
        row,
        item: row.booking_item_id ? byId.get(row.booking_item_id) || null : null,
        sourceDocument: sources.has(row.id),
        taille: row.storage_path && sizes.has(row.storage_path) ? sizes.get(row.storage_path)! : null,
      })
    )
    .sort((a, b) => (a.ajoute_le || "").localeCompare(b.ajoute_le || "") || a.id.localeCompare(b.id));
  return { dossier_id: booking.id, reference: booking.reference, pieces: vues };
}

function isPdf(row: DossierPieceRow) {
  const mime = (row.mime_type || "").toLowerCase();
  const name = (row.file_name || "").toLowerCase();
  return mime === "application/pdf" || name.endsWith(".pdf");
}

function isPlain(row: DossierPieceRow) {
  const mime = (row.mime_type || "").toLowerCase();
  const name = (row.file_name || "").toLowerCase();
  return mime.startsWith("text/") || name.endsWith(".txt");
}

function decodePlain(bytes: Uint8Array) {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.includes("\u0000")) return "";
  return text;
}

export async function lirePieceDossier(input: Record<string, unknown>, deps: DossierPieceDeps = {}) {
  const documentId = requireUuid(input.document_id, "Pièce");
  const admin = clientOf(deps);
  const piece = await loadPiece(admin, documentId);
  if (!piece) throw new McpReadError("Pièce introuvable.");
  const path = piece.storage_path || "";
  if (!path) throw new McpReadError("Pièce introuvable.");
  let texte: string | null = null;
  let tronque = false;
  if (isPdf(piece) || isPlain(piece)) {
    try {
      const file = await (deps.readBytes ?? downloadCrmFile)(path);
      const raw = isPlain(piece)
        ? decodePlain(file.bytes)
        : (await (deps.pdfText ?? ((bytes: Uint8Array) => pdfPlainText(bytes)))(file.bytes)).text || "";
      const read = pieceReadText(raw);
      if (read) {
        texte = read.texte;
        tronque = read.tronque;
      }
    } catch (err) {
      console.error("[mcp] piece", err instanceof Error ? err.message : "error");
    }
  }
  const body: Record<string, unknown> = {
    id: piece.id,
    dossier_id: piece.booking_id,
    nom: (piece.file_name || "").trim() || "fichier",
    type_mime: (piece.mime_type || "").trim() || "application/octet-stream",
    texte,
    tronque,
    retiree: pieceEstRetiree(piece.extracted),
  };
  if (texte == null) {
    try {
      body.url_signee = await (deps.signedUrl ?? signedCrmUrl)(path, PIECE_URL_SECONDS);
      body.expire_secondes = PIECE_URL_SECONDS;
    } catch {
      throw new McpReadError("Lecture impossible.");
    }
  }
  return body;
}

export async function rattacherPieceCarte(input: Record<string, unknown>, deps: DossierPieceDeps = {}) {
  const documentId = requireUuid(input.document_id, "Pièce");
  const detach = input.detacher === true;
  const carteId = detach ? null : requireUuid(input.carte_id, "Carte");
  const booking = await bookingOf(input, deps);
  const admin = clientOf(deps);
  const piece = pieceOnBooking(await loadPiece(admin, documentId), booking.id, false);
  if (carteId) {
    const { data, error } = await admin
      .from("crm_booking_items")
      .select("id")
      .eq("id", carteId)
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (error || !data) throw new McpWriteError("Cette carte n’est pas sur ce dossier.");
  }
  if ((piece.booking_item_id || null) !== carteId) {
    await savePiece(admin, documentId, booking.id, { booking_item_id: carteId });
  }
  return {
    document_id: documentId,
    dossier_id: booking.id,
    reference: booking.reference,
    carte_id: carteId,
    visibilite: piece.visible_to_client === true ? "visible" : "masquee",
  };
}

export async function changerVisibilitePiece(input: Record<string, unknown>, deps: DossierPieceDeps = {}) {
  if (typeof input.visible !== "boolean") throw new McpWriteError("Indiquez visible, vrai ou faux.");
  const documentId = requireUuid(input.document_id, "Pièce");
  const booking = await bookingOf(input, deps);
  const admin = clientOf(deps);
  const piece = pieceOnBooking(await loadPiece(admin, documentId), booking.id, false);
  if (piece.visible_to_client !== input.visible) {
    await savePiece(admin, documentId, booking.id, { visible_to_client: input.visible });
  }
  return {
    document_id: documentId,
    dossier_id: booking.id,
    reference: booking.reference,
    visibilite: input.visible ? "visible" : "masquee",
  };
}

export async function retirerPieceDossier(input: Record<string, unknown>, deps: DossierPieceDeps = {}) {
  if (input.confirmer !== true) throw new McpWriteError(CONFIRM);
  const documentId = requireUuid(input.document_id, "Pièce");
  const booking = await bookingOf(input, deps);
  const admin = clientOf(deps);
  const piece = await loadPiece(admin, documentId);
  if (!piece) throw new McpWriteError("Pièce introuvable.");
  if (piece.booking_id !== booking.id) throw new McpWriteError(OTHER_DOSSIER);
  const archive = readPieceArchive(piece.extracted);
  if (input.restaurer === true) {
    if (!archive) throw new McpWriteError("Cette pièce n’est pas retirée.");
    await savePiece(admin, documentId, booking.id, {
      extracted: withoutPieceArchive(piece.extracted),
      visible_to_client: archive.visible_avant,
    });
    return {
      restauree: true,
      document_id: documentId,
      dossier_id: booking.id,
      reference: booking.reference,
      visibilite: archive.visible_avant ? "visible" : "masquee",
    };
  }
  if (archive) {
    return { retiree: true, deja_retiree: true, document_id: documentId, dossier_id: booking.id, reference: booking.reference };
  }
  const when = deps.now ? deps.now() : new Date().toISOString();
  await savePiece(admin, documentId, booking.id, {
    visible_to_client: false,
    extracted: withPieceArchive(piece.extracted, {
      retiree_at: when,
      visible_avant: piece.visible_to_client === true,
    }),
  });
  return { retiree: true, document_id: documentId, dossier_id: booking.id, reference: booking.reference };
}
