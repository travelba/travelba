import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { isIsoDate } from "@/lib/crm/admin-schemas";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { DOC_TYPE_LABELS, isTravelAuthorization, type CrmBooking, type TravelDocType } from "@/lib/crm/types";
import { resolveNationality } from "@/lib/crm/countries";
import { notifyFormalitiesReady, type FormalityAudience, type FormalityNotice, type FormalityRecipient } from "@/lib/crm/concierge-send";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import {
  assertBookingForCustomer,
  assertTravelerOnBooking,
  saveUploadedTravelDocument,
} from "@/lib/crm/travel-document-write";
import {
  assertUpload,
  MAX_UPLOAD_BYTES,
  UPLOAD_EMPTY_ERROR,
  UPLOAD_SIZE_ERROR,
  UploadPolicyError,
} from "@/lib/crm/upload-policy";
import { createServiceClient } from "@/lib/supabase/admin";
import { McpWriteError } from "./mcp-write";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_B64 = 4 * Math.ceil(MAX_UPLOAD_BYTES / 3);

const DOC_TYPE_INPUT: Record<string, TravelDocType> = {
  visa: "visa",
  eta: "eta",
  eta_il: "eta",
  autorisation_de_voyage: "eta",
  autorisation_de_voyage_eta: "eta",
  esta: "visa",
  passeport: "passport",
  passport: "passport",
  carte_identite: "id_card",
  carte_d_identite: "id_card",
  id_card: "id_card",
  identite: "id_card",
  assurance: "insurance",
  insurance: "insurance",
  autre: "other",
  other: "other",
};

const KNOWN_WRITE = new Set([
  "Réservation introuvable",
  "Voyageur introuvable",
  "Voyage requis pour rattacher un voyageur",
]);

export type PieceUpload = (path: string, bytes: Buffer, contentType: string) => Promise<unknown>;
export type PieceReconcile = (customerId: string, admin: SupabaseClient) => Promise<void>;
export type PieceNotify = (
  bookingId: string,
  countries: string[],
  admin: SupabaseClient,
  options?: { travelerIds?: string[]; audience?: FormalityAudience }
) => Promise<FormalityNotice[]>;

export type PreparedPiece = {
  clientId: string;
  dossierId: string;
  reference: string;
  voyageurId: string;
  docType: TravelDocType;
  issuingCountry: string | null;
  number: string | null;
  expiresOn: string | null;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

function client(admin?: SupabaseClient) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function failDb(error: DbErrorLike, fallback: string): never {
  console.error("[mcp]", error?.code ?? "?");
  throw new McpWriteError(dbErrorMessage(error, fallback));
}

function uuid(value: unknown, label: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

function optionalId(value: unknown, label: string) {
  if (value == null || value === "") return "";
  return uuid(value, label);
}

function optionalText(value: unknown, label: string, max: number) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpWriteError(`${label} invalide.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new McpWriteError(`${label} : ${max} caractères maximum.`);
  return trimmed;
}

function pieceType(value: unknown): TravelDocType {
  if (typeof value !== "string" || !value.trim()) throw new McpWriteError("Type de pièce requis.");
  const key = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const docType = DOC_TYPE_INPUT[key];
  if (!docType) {
    throw new McpWriteError("Type de pièce inconnu. visa, eta, passeport, carte_identite, assurance ou autre.");
  }
  return docType;
}

function decodePiece(raw: unknown): Buffer {
  if (typeof raw !== "string" || !raw.trim()) throw new McpWriteError(UPLOAD_EMPTY_ERROR);
  const compact = raw.replace(/\s+/g, "");
  const payload = compact.replace(/^data:[^;,]*(?:;[^,]*)?,/i, "");
  if (!payload) throw new McpWriteError(UPLOAD_EMPTY_ERROR);
  if (payload.length > MAX_B64) throw new McpWriteError(UPLOAD_SIZE_ERROR);
  if (payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    throw new McpWriteError("Fichier illisible.");
  }
  const bytes = Buffer.from(payload, "base64");
  if (!bytes.length) throw new McpWriteError(UPLOAD_EMPTY_ERROR);
  return bytes;
}

/** Valide la saisie MCP avant toute écriture. Le numéro n’est pas renvoyé. */
export function prepareTravelPiece(input: Record<string, unknown>): PreparedPiece {
  const clientId = optionalId(input.client_id, "Client");
  const dossierId = optionalId(input.dossier_id, "Dossier");
  const reference = optionalText(input.reference, "Référence", 80) || "";
  const voyageurId = optionalId(input.voyageur_id, "Voyageur");
  if (!clientId && !dossierId && !reference) throw new McpWriteError("Indiquez le client ou le dossier.");
  if (voyageurId && !dossierId && !reference) {
    throw new McpWriteError("Indiquez le dossier pour rattacher le voyageur.");
  }
  const fileName = optionalText(input.nom_fichier, "Nom de fichier", 180);
  if (!fileName) throw new McpWriteError("Nom de fichier requis.");
  const mimeType = optionalText(input.type_mime, "Type mime", 120) || "";
  const expiresOn = optionalText(input.expiration, "Date d’expiration", 40);
  if (expiresOn && !isIsoDate(expiresOn)) throw new McpWriteError("Date d’expiration invalide (AAAA-MM-JJ).");
  const bytes = decodePiece(input.contenu);
  try {
    assertUpload({ size: bytes.length, type: mimeType, name: fileName });
  } catch (err) {
    if (err instanceof UploadPolicyError) throw new McpWriteError(err.message);
    throw err;
  }
  return {
    clientId,
    dossierId,
    reference,
    voyageurId,
    docType: pieceType(input.type),
    issuingCountry: optionalText(input.pays, "Pays", 80),
    number: optionalText(input.numero, "Numéro", 40),
    expiresOn,
    fileName,
    mimeType,
    bytes,
  };
}

function raise(err: unknown, fallback: string): never {
  if (err instanceof McpWriteError) throw err;
  if (err instanceof UploadPolicyError) throw new McpWriteError(err.message);
  const message = err instanceof Error ? err.message : "";
  if (KNOWN_WRITE.has(message)) throw new McpWriteError(message.endsWith(".") ? message : `${message}.`);
  console.error("[mcp] piece", message || "error");
  throw new McpWriteError(fallback);
}

async function loadBooking(
  admin: SupabaseClient,
  target: { id: string; reference: string }
): Promise<Pick<CrmBooking, "id" | "reference" | "customer_id">> {
  let query = admin.from("crm_bookings").select("id, reference, customer_id");
  query = target.id ? query.eq("id", target.id) : query.eq("reference", target.reference);
  const { data, error } = await query.limit(2);
  if (error) failDb(error, "Dossier introuvable.");
  const rows = (data || []) as Pick<CrmBooking, "id" | "reference" | "customer_id">[];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0];
}

/**
 * Dépose une pièce dans l’espace client, comme le formulaire Pièces.
 * Une formalité liée au séjour envoie le WhatsApp « formalité prête », sauf `notifier: false`.
 */
export async function addTravelPiece(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: { upload?: PieceUpload; reconcile?: PieceReconcile; notify?: PieceNotify }
) {
  const draft = prepareTravelPiece(input);
  const db = client(admin);
  const booking =
    draft.dossierId || draft.reference ? await loadBooking(db, { id: draft.dossierId, reference: draft.reference }) : null;
  if (booking && draft.clientId && booking.customer_id !== draft.clientId) {
    throw new McpWriteError("Ce dossier n’est pas celui de ce client.");
  }
  const customerId = draft.clientId || booking?.customer_id || "";
  const { data: customer, error: customerError } = await db
    .from("crm_customers")
    .select("id")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError) failDb(customerError, "Client introuvable.");
  if (!customer) throw new McpWriteError("Client introuvable.");
  let document;
  try {
    await assertBookingForCustomer(db, customerId, booking?.id ?? null);
    await assertTravelerOnBooking(db, booking?.id ?? null, draft.voyageurId || null);
    document = await saveUploadedTravelDocument(
      db,
      {
        customerId,
        bookingId: booking?.id || null,
        travelerId: draft.voyageurId || null,
        docType: draft.docType,
        issuingCountry: draft.issuingCountry,
        number: draft.number,
        expiresOn: draft.expiresOn,
      },
      { name: draft.fileName, type: draft.mimeType, bytes: draft.bytes },
      deps?.upload
    );
  } catch (err) {
    raise(err, "Enregistrement impossible.");
  }
  await (deps?.reconcile ?? reconcileCustomerParty)(customerId, db);
  const linked = Boolean(booking);
  const notice = await notifyLinkedPiece(
    db,
    {
      notifier: input.notifier !== false,
      bookingId: booking?.id || null,
      docType: document.doc_type,
      issuingCountry: document.issuing_country,
      travelerId: document.traveler_id,
      audience: "tous",
    },
    deps?.notify ?? notifyFormalitiesReady
  );
  return {
    id: document.id,
    client_id: customerId,
    dossier_id: booking?.id || null,
    reference: booking?.reference || null,
    voyageur_id: document.traveler_id,
    type: document.doc_type,
    libelle: DOC_TYPE_LABELS[document.doc_type],
    pays: document.issuing_country,
    fichier: document.file_name,
    endroit: linked ? `Espace client · séjour ${booking?.reference}` : "Espace client · Pièces",
    lien: linked ? `/mon-compte/reservations/${booking?.reference}` : "/mon-compte/profil/documents",
    lien_agence: linked ? `/admin/reservations/${booking?.id}` : `/admin/clients/${customerId}`,
    notifie: notice.notifie,
    raison: notice.raison,
    destinataires: notice.destinataires,
  };
}

/** Renvoie le WhatsApp « formalité prête » pour une pièce déjà déposée. */
export async function notifyTravelPiece(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: { notify?: PieceNotify }
) {
  const id = uuid(input.document_id, "Pièce");
  const db = client(admin);
  const { data, error } = await db
    .from("crm_travel_documents")
    .select("id, booking_id, traveler_id, doc_type, issuing_country")
    .eq("id", id)
    .maybeSingle();
  if (error) failDb(error, "Pièce introuvable.");
  const doc = data as {
    id: string;
    booking_id: string | null;
    traveler_id: string | null;
    doc_type: string;
    issuing_country: string | null;
  } | null;
  if (!doc) throw new McpWriteError("Pièce introuvable.");
  const notice = await notifyLinkedPiece(
    db,
    {
      notifier: true,
      bookingId: doc.booking_id,
      docType: doc.doc_type,
      issuingCountry: doc.issuing_country,
      travelerId: doc.traveler_id,
      audience: audienceOf(input.destinataires),
    },
    deps?.notify ?? notifyFormalitiesReady
  );
  return {
    id: doc.id,
    dossier_id: doc.booking_id,
    voyageur_id: doc.traveler_id,
    notifie: notice.notifie,
    raison: notice.raison,
    destinataires: notice.destinataires,
  };
}

function audienceOf(value: unknown): FormalityAudience {
  if (value == null || value === "") return "tous";
  if (value === "tous" || value === "client" || value === "voyageur") return value;
  throw new McpWriteError("Destinataires : voyageur, client ou tous.");
}

async function notifyLinkedPiece(
  admin: SupabaseClient,
  input: {
    notifier: boolean;
    bookingId: string | null;
    docType: string;
    issuingCountry: string | null;
    travelerId: string | null;
    audience: FormalityAudience;
  },
  notify: PieceNotify
): Promise<{ notifie: boolean; raison: string | null; destinataires: FormalityRecipient[] }> {
  const quiet = (raison: string) => ({ notifie: false, raison, destinataires: [] as FormalityRecipient[] });
  if (!input.notifier) return quiet("Notification non demandée.");
  if (!input.bookingId) return quiet("La pièce n’est pas liée à un séjour.");
  if (!isTravelAuthorization(input.docType)) return quiet("La pièce n’est pas une formalité.");
  const iso = resolveNationality(input.issuingCountry);
  if (!iso) return quiet("Pays émetteur manquant.");
  try {
    const [row] = await notify(input.bookingId, [iso], admin, {
      travelerIds: input.travelerId ? [input.travelerId] : [],
      audience: input.audience,
    });
    if (!row) return quiet("Message non parti.");
    return {
      notifie: row.notifie,
      raison: row.notifie ? null : row.raison,
      destinataires: row.destinataires || [],
    };
  } catch (err) {
    console.error("[mcp] piece", err instanceof Error ? err.message : "error");
    return quiet("Message non parti.");
  }
}
