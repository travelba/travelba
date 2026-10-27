import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { isIsoDate } from "@/lib/crm/admin-schemas";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { DOC_TYPE_LABELS, isTravelAuthorization, type CrmBooking, type TravelDocType } from "@/lib/crm/types";
import { resolveNationality } from "@/lib/crm/countries";
import { notifyFormalitiesReady, type FormalityAudience, type FormalityNotice, type FormalityRecipient } from "@/lib/crm/concierge-send";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { BOARDING_PASS_KIND, isBoardingPassFile } from "@/lib/crm/boarding-pass-whatsapp";
import {
  assertBookingForCustomer,
  assertTravelerOnBooking,
  customerDocumentStoragePath,
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

export type PieceDocType = TravelDocType | "carte_embarquement";

const DOC_TYPE_INPUT: Record<string, PieceDocType> = {
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
  carte_embarquement: "carte_embarquement",
  carte_d_embarquement: "carte_embarquement",
};

const PIECE_TYPE_ERROR = "Type de pièce inconnu. visa, eta, passeport, carte_identite, assurance, autre ou carte_embarquement.";

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
  docType: PieceDocType;
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

function pieceType(value: unknown): PieceDocType {
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
  if (!docType) throw new McpWriteError(PIECE_TYPE_ERROR);
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
  if (!clientId && !dossierId && !reference && !voyageurId) {
    throw new McpWriteError("Indiquez le client ou le dossier.");
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

type PieceTarget = {
  customerId: string;
  booking: Pick<CrmBooking, "id" | "reference" | "customer_id"> | null;
  companionId: string | null;
  travelerId: string | null;
  /** Coffre du titulaire, d’un accompagnateur, ou voyageur de dossier sans fiche. */
  vault: "holder" | "companion" | "none";
};

type StoredPassport = {
  id: string;
  companion_id: string | null;
  booking_id: string | null;
  traveler_id: string | null;
  number: string | null;
  issuing_country: string | null;
  issued_on: string | null;
  expires_on: string | null;
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  birth_date: string | null;
  nationality: string | null;
  sex: string | null;
  place_of_birth: string | null;
  authority: string | null;
  personal_number: string | null;
  created_at: string;
};

type SavedPiece = {
  id: string;
  doc_type: TravelDocType;
  issuing_country: string | null;
  traveler_id: string | null;
  file_name: string | null;
};

const PASSPORT_COLUMNS =
  "id, companion_id, booking_id, traveler_id, number, issuing_country, issued_on, expires_on, first_name, last_name, usage_name, birth_date, nationality, sex, place_of_birth, authority, personal_number, created_at";

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function countryOf(row: { issuing_country: string | null }) {
  return resolveNationality(row.issuing_country);
}

function sexOf(value: string | null | undefined): "M" | "F" | "X" | null {
  const code = (value || "").trim().toUpperCase();
  if (code === "M" || code === "F" || code === "X") return code;
  return null;
}

function asPassport(row: Record<string, unknown>): StoredPassport {
  return {
    id: String(row.id),
    companion_id: textOrNull(row.companion_id),
    booking_id: textOrNull(row.booking_id),
    traveler_id: textOrNull(row.traveler_id),
    number: textOrNull(row.number),
    issuing_country: textOrNull(row.issuing_country),
    issued_on: textOrNull(row.issued_on),
    expires_on: textOrNull(row.expires_on),
    first_name: textOrNull(row.first_name),
    last_name: textOrNull(row.last_name),
    usage_name: textOrNull(row.usage_name),
    birth_date: textOrNull(row.birth_date),
    nationality: textOrNull(row.nationality),
    sex: textOrNull(row.sex),
    place_of_birth: textOrNull(row.place_of_birth),
    authority: textOrNull(row.authority),
    personal_number: textOrNull(row.personal_number),
    created_at: textOrNull(row.created_at) || "",
  };
}

function filledCount(row: StoredPassport) {
  return [
    row.issued_on,
    row.authority,
    row.first_name,
    row.last_name,
    row.usage_name,
    row.birth_date,
    row.nationality,
    row.sex,
    row.place_of_birth,
    row.personal_number,
  ].filter(Boolean).length;
}

function richest(rows: StoredPassport[]) {
  return rows
    .slice()
    .sort((a, b) => filledCount(b) - filledCount(a) || b.created_at.localeCompare(a.created_at))[0];
}

function inScope(row: StoredPassport, target: PieceTarget) {
  if (target.booking) {
    return row.booking_id === target.booking.id && (row.traveler_id || null) === (target.travelerId || null);
  }
  if (row.booking_id) return false;
  if (target.vault === "companion") return row.companion_id === target.companionId;
  if (target.vault === "holder") return !row.companion_id;
  return false;
}

function sameVaultPerson(row: StoredPassport, target: PieceTarget) {
  if (row.booking_id) return false;
  if (target.vault === "holder") return !row.companion_id;
  if (target.vault === "companion") return row.companion_id === target.companionId;
  return false;
}

/** Un seul passeport, ou le pays indiqué. Plusieurs sans pays : on ne choisit pas. */
function choosePassport(scoped: StoredPassport[], country: string | null) {
  if (!scoped.length) return null;
  if (!country) {
    if (scoped.length > 1) throw new McpWriteError("Plusieurs passeports pour ce voyageur. Indiquez le pays.");
    return { row: scoped[0], extras: [] as StoredPassport[] };
  }
  const exact = scoped.filter((row) => countryOf(row) === country);
  if (exact.length) {
    const row = richest(exact);
    return { row, extras: exact.filter((item) => item.id !== row.id) };
  }
  if (scoped.length === 1 && !countryOf(scoped[0])) return { row: scoped[0], extras: [] as StoredPassport[] };
  return null;
}

function donorPassport(vaultRows: StoredPassport[], country: string | null) {
  if (!vaultRows.length) return null;
  if (country) {
    const exact = vaultRows.filter((row) => countryOf(row) === country);
    if (!exact.length) return null;
    return richest(exact);
  }
  if (vaultRows.length > 1) throw new McpWriteError("Plusieurs passeports pour ce voyageur. Indiquez le pays.");
  return vaultRows[0];
}

async function resolvePieceTarget(db: SupabaseClient, draft: PreparedPiece): Promise<PieceTarget> {
  if (draft.dossierId || draft.reference) {
    const booking = await loadBooking(db, { id: draft.dossierId, reference: draft.reference });
    if (draft.clientId && booking.customer_id !== draft.clientId) {
      throw new McpWriteError("Ce dossier n’est pas celui de ce client.");
    }
    return {
      customerId: draft.clientId || booking.customer_id,
      booking,
      companionId: null,
      travelerId: draft.voyageurId || null,
      vault: "none",
    };
  }
  if (!draft.voyageurId || (draft.clientId && draft.voyageurId === draft.clientId)) {
    if (!draft.clientId) throw new McpWriteError("Indiquez le client ou le dossier.");
    return { customerId: draft.clientId, booking: null, companionId: null, travelerId: null, vault: "holder" };
  }
  const { data, error } = await db
    .from("crm_travel_companions")
    .select("id, customer_id")
    .eq("id", draft.voyageurId)
    .maybeSingle();
  if (error) failDb(error, "Voyageur introuvable.");
  const companion = data as { id: string; customer_id: string } | null;
  if (!companion) throw new McpWriteError("Indiquez le dossier pour rattacher le voyageur.");
  if (draft.clientId && companion.customer_id !== draft.clientId) {
    throw new McpWriteError("Ce voyageur n’est pas rattaché à ce client.");
  }
  return {
    customerId: companion.customer_id,
    booking: null,
    companionId: companion.id,
    travelerId: null,
    vault: "companion",
  };
}

async function bindTraveler(db: SupabaseClient, target: PieceTarget): Promise<PieceTarget> {
  if (!target.booking) return target;
  const traveler = await assertTravelerOnBooking(db, target.booking.id, target.travelerId);
  if (!traveler || traveler.is_account_holder) {
    return { ...target, companionId: null, travelerId: traveler?.id || null, vault: "holder" };
  }
  if (traveler.companion_id) {
    return { ...target, companionId: traveler.companion_id, travelerId: traveler.id, vault: "companion" };
  }
  return { ...target, companionId: null, travelerId: traveler.id, vault: "none" };
}

async function loadPassports(db: SupabaseClient, customerId: string) {
  const { data, error } = await db
    .from("crm_travel_documents")
    .select(PASSPORT_COLUMNS)
    .eq("customer_id", customerId)
    .eq("doc_type", "passport")
    .limit(80);
  if (error) failDb(error, "Enregistrement impossible.");
  return ((data || []) as Record<string, unknown>[]).map(asPassport);
}

async function updatePassport(
  db: SupabaseClient,
  row: StoredPassport,
  extras: StoredPassport[],
  draft: PreparedPiece,
  customerId: string,
  upload?: PieceUpload
): Promise<SavedPiece> {
  const storagePath = customerDocumentStoragePath(customerId, draft.fileName);
  await (upload ?? uploadCrmFile)(storagePath, draft.bytes, draft.mimeType || "application/octet-stream");
  const patch: Record<string, string | null> = {
    storage_path: storagePath,
    file_name: draft.fileName,
    mime_type: draft.mimeType || null,
  };
  if (draft.number) patch.number = draft.number;
  if (draft.expiresOn) patch.expires_on = draft.expiresOn;
  if (draft.issuingCountry) patch.issuing_country = resolveNationality(draft.issuingCountry) || draft.issuingCountry;
  const updated = await db.from("crm_travel_documents").update(patch).eq("id", row.id).eq("customer_id", customerId);
  if (updated.error) failDb(updated.error, "Enregistrement impossible.");
  for (const extra of extras) {
    const removed = await db.from("crm_travel_documents").delete().eq("id", extra.id).eq("customer_id", customerId);
    if (removed.error) failDb(removed.error, "Enregistrement impossible.");
  }
  return {
    id: row.id,
    doc_type: "passport",
    issuing_country: patch.issuing_country ?? row.issuing_country,
    traveler_id: row.traveler_id,
    file_name: draft.fileName,
  };
}

/**
 * Passeport déjà là : on écrit le fichier et les champs fournis.
 * Délivrance, autorité, noms, naissance, nationalité, sexe et lieu restent.
 * Pas de synchro ESTA / ETA : aucun message.
 */
async function storePassport(
  db: SupabaseClient,
  target: PieceTarget,
  draft: PreparedPiece,
  upload?: PieceUpload
): Promise<SavedPiece> {
  const rows = await loadPassports(db, target.customerId);
  const country = draft.issuingCountry ? resolveNationality(draft.issuingCountry) : null;
  const chosen = choosePassport(rows.filter((row) => inScope(row, target)), country);
  if (chosen) return updatePassport(db, chosen.row, chosen.extras, draft, target.customerId, upload);
  const donor = donorPassport(
    rows.filter((row) => sameVaultPerson(row, target)),
    country
  );
  const document = await saveUploadedTravelDocument(
    db,
    {
      customerId: target.customerId,
      companionId: target.companionId,
      bookingId: target.booking?.id || null,
      travelerId: target.travelerId,
      docType: "passport",
      number: draft.number ?? donor?.number ?? null,
      issuingCountry: draft.issuingCountry ?? donor?.issuing_country ?? null,
      issuedOn: donor?.issued_on ?? null,
      expiresOn: draft.expiresOn ?? donor?.expires_on ?? null,
      placeOfBirth: donor?.place_of_birth ?? null,
      authority: donor?.authority ?? null,
      personalNumber: donor?.personal_number ?? null,
      first_name: donor?.first_name ?? null,
      last_name: donor?.last_name ?? null,
      usage_name: donor?.usage_name ?? null,
      birth_date: donor?.birth_date ?? null,
      nationality: donor?.nationality ?? null,
      sex: sexOf(donor?.sex),
      formalities: false,
    },
    { name: draft.fileName, type: draft.mimeType, bytes: draft.bytes },
    upload
  );
  return document;
}

/**
 * Dépose une pièce dans l’espace client, comme le formulaire Pièces.
 * Une formalité liée au séjour envoie le WhatsApp « formalité prête », sauf `notifier: false`.
 * Un passeport déjà enregistré est complété, pas réécrit à vide. Aucun message pour ce scan.
 */
export async function addTravelPiece(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: { upload?: PieceUpload; reconcile?: PieceReconcile; notify?: PieceNotify }
) {
  const draft = prepareTravelPiece(input);
  const db = client(admin);
  let target: PieceTarget;
  try {
    target = await bindTraveler(db, await resolvePieceTarget(db, draft));
  } catch (err) {
    raise(err, "Enregistrement impossible.");
  }
  const { data: customer, error: customerError } = await db
    .from("crm_customers")
    .select("id")
    .eq("id", target.customerId)
    .maybeSingle();
  if (customerError) failDb(customerError, "Client introuvable.");
  if (!customer) throw new McpWriteError("Client introuvable.");
  if (draft.docType === "carte_embarquement") {
    return storeBoardingPass(db, target, draft, deps?.upload);
  }
  let document: SavedPiece;
  try {
    await assertBookingForCustomer(db, target.customerId, target.booking?.id ?? null);
    if (draft.docType === "passport") {
      document = await storePassport(db, target, draft, deps?.upload);
    } else {
      document = await saveUploadedTravelDocument(
        db,
        {
          customerId: target.customerId,
          companionId: target.companionId,
          bookingId: target.booking?.id || null,
          travelerId: target.travelerId,
          docType: draft.docType,
          issuingCountry: draft.issuingCountry,
          number: draft.number,
          expiresOn: draft.expiresOn,
          formalities: false,
        },
        { name: draft.fileName, type: draft.mimeType, bytes: draft.bytes },
        deps?.upload
      );
    }
  } catch (err) {
    raise(err, "Enregistrement impossible.");
  }
  await (deps?.reconcile ?? reconcileCustomerParty)(target.customerId, db);
  const linked = Boolean(target.booking);
  const notice = await notifyLinkedPiece(
    db,
    {
      notifier: input.notifier !== false,
      bookingId: target.booking?.id || null,
      docType: document.doc_type,
      issuingCountry: document.issuing_country,
      travelerId: document.traveler_id,
      audience: "tous",
    },
    deps?.notify ?? notifyFormalitiesReady
  );
  return {
    id: document.id,
    client_id: target.customerId,
    dossier_id: target.booking?.id || null,
    reference: target.booking?.reference || null,
    voyageur_id: document.traveler_id || target.companionId,
    type: document.doc_type,
    libelle: DOC_TYPE_LABELS[document.doc_type],
    pays: document.issuing_country,
    fichier: document.file_name,
    endroit: linked ? `Espace client · séjour ${target.booking?.reference}` : "Espace client · Pièces",
    lien: linked ? `/mon-compte/reservations/${target.booking?.reference}` : "/mon-compte/profil/documents",
    lien_agence: linked ? `/admin/reservations/${target.booking?.id}` : `/admin/clients/${target.customerId}`,
    notifie: notice.notifie,
    raison: notice.raison,
    destinataires: notice.destinataires,
  };
}

const BOARDING_PASS_LABEL = "Carte d’embarquement";

function boardingPassQuiet(reference: string) {
  return {
    notifie: false,
    raison: "La carte d’embarquement ne part pas toute seule.",
    destinataires: [] as FormalityRecipient[],
    endroit: `Dossier ${reference} · cartes d’embarquement`,
  };
}

/** PDF du dossier, même type que le bouton Cartes d’embarquement. Aucun WhatsApp. */
async function storeBoardingPass(
  db: SupabaseClient,
  target: PieceTarget,
  draft: PreparedPiece,
  upload?: PieceUpload
) {
  if (!target.booking) throw new McpWriteError("La carte d’embarquement se dépose sur un dossier.");
  if (!isBoardingPassFile({ kind: BOARDING_PASS_KIND, mime_type: draft.mimeType, file_name: draft.fileName })) {
    throw new McpWriteError("La carte d’embarquement doit être un PDF.");
  }
  await assertBookingForCustomer(db, target.customerId, target.booking.id);
  const path = `bookings/${target.booking.id}/${Date.now()}-${safeFileName(draft.fileName)}`;
  await (upload ?? uploadCrmFile)(path, draft.bytes, draft.mimeType || "application/pdf");
  const { data, error } = await db
    .from("crm_booking_documents")
    .insert({
      booking_id: target.booking.id,
      kind: BOARDING_PASS_KIND,
      file_name: draft.fileName,
      mime_type: draft.mimeType || "application/pdf",
      storage_path: path,
      visible_to_client: false,
    })
    .select("id, file_name")
    .single();
  if (error) failDb(error, "Enregistrement impossible.");
  const quiet = boardingPassQuiet(target.booking.reference);
  return {
    id: String(data?.id || ""),
    client_id: target.customerId,
    dossier_id: target.booking.id,
    reference: target.booking.reference,
    voyageur_id: null,
    type: "carte_embarquement" as const,
    libelle: BOARDING_PASS_LABEL,
    pays: null,
    fichier: draft.fileName,
    endroit: quiet.endroit,
    lien: `/mon-compte/reservations/${target.booking.reference}`,
    lien_agence: `/admin/reservations/${target.booking.id}`,
    notifie: quiet.notifie,
    raison: quiet.raison,
    destinataires: quiet.destinataires,
  };
}

type TravelPieceRow = {
  id: string;
  booking_id: string | null;
  doc_type: string;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
};

type BookingPieceRow = {
  id: string;
  booking_id: string;
  kind: string;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
};

function pieceLabel(type: PieceDocType) {
  if (type === "carte_embarquement") return BOARDING_PASS_LABEL;
  return DOC_TYPE_LABELS[type];
}

/**
 * Change le type d’une pièce déjà sur un dossier.
 * `carte_embarquement` devient le PDF du dossier que l’envoi WhatsApp attend.
 * Le fichier n’est pas recopié. Une pièce sans séjour n’est pas touchée.
 */
export async function requalifyPiece(input: Record<string, unknown>, admin?: SupabaseClient) {
  const id = uuid(input.document_id, "Pièce");
  const type = pieceType(input.type);
  const db = client(admin);
  const { data: bookingData, error: bookingError } = await db
    .from("crm_booking_documents")
    .select("id, booking_id, kind, file_name, mime_type, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (bookingError) failDb(bookingError, "Pièce introuvable.");
  const bookingDoc = bookingData as BookingPieceRow | null;
  if (bookingDoc) return requalifyBookingPiece(db, bookingDoc, type);

  const { data: travelData, error: travelError } = await db
    .from("crm_travel_documents")
    .select("id, booking_id, doc_type, file_name, mime_type, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (travelError) failDb(travelError, "Pièce introuvable.");
  const travelDoc = travelData as TravelPieceRow | null;
  if (!travelDoc) throw new McpWriteError("Pièce introuvable.");
  if (!travelDoc.booking_id) throw new McpWriteError("La pièce n’est pas liée à un séjour.");
  if (type === "carte_embarquement") return moveTravelPieceToBoardingPass(db, travelDoc);
  const { error } = await db
    .from("crm_travel_documents")
    .update({ doc_type: type })
    .eq("id", travelDoc.id)
    .eq("booking_id", travelDoc.booking_id);
  if (error) failDb(error, "Requalification impossible.");
  return pieceResult(travelDoc.id, travelDoc.booking_id, type, travelDoc.file_name);
}

async function requalifyBookingPiece(db: SupabaseClient, doc: BookingPieceRow, type: PieceDocType) {
  if (!doc.booking_id) throw new McpWriteError("La pièce n’est pas liée à un séjour.");
  if (type !== "carte_embarquement" && type !== "other") {
    throw new McpWriteError("Cette pièce du dossier se requalifie en carte d’embarquement ou autre.");
  }
  const kind = type === "carte_embarquement" ? BOARDING_PASS_KIND : "other";
  if (kind === BOARDING_PASS_KIND && !isBoardingPassFile({ kind, mime_type: doc.mime_type, file_name: doc.file_name })) {
    throw new McpWriteError("La carte d’embarquement doit être un PDF.");
  }
  if (doc.kind !== kind) {
    const { error } = await db
      .from("crm_booking_documents")
      .update({ kind })
      .eq("id", doc.id)
      .eq("booking_id", doc.booking_id);
    if (error) failDb(error, "Requalification impossible.");
  }
  return pieceResult(doc.id, doc.booking_id, type, doc.file_name);
}

async function moveTravelPieceToBoardingPass(db: SupabaseClient, doc: TravelPieceRow) {
  const bookingId = doc.booking_id || "";
  if (!doc.storage_path) throw new McpWriteError("La pièce n’a pas de fichier.");
  if (!isBoardingPassFile({ kind: BOARDING_PASS_KIND, mime_type: doc.mime_type, file_name: doc.file_name })) {
    throw new McpWriteError("La carte d’embarquement doit être un PDF.");
  }
  const { error: insertError } = await db.from("crm_booking_documents").insert({
    id: doc.id,
    booking_id: bookingId,
    kind: BOARDING_PASS_KIND,
    file_name: doc.file_name,
    mime_type: doc.mime_type || "application/pdf",
    storage_path: doc.storage_path,
    visible_to_client: false,
  });
  if (insertError) failDb(insertError, "Requalification impossible.");
  const { error: deleteError } = await db
    .from("crm_travel_documents")
    .delete()
    .eq("id", doc.id)
    .eq("booking_id", bookingId);
  if (deleteError) failDb(deleteError, "Requalification impossible.");
  return pieceResult(doc.id, bookingId, "carte_embarquement", doc.file_name);
}

async function pieceResult(id: string, bookingId: string, type: PieceDocType, fileName: string | null) {
  return {
    id,
    dossier_id: bookingId,
    type: type === "carte_embarquement" ? "carte_embarquement" : type,
    libelle: pieceLabel(type),
    fichier: fileName,
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
