import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import WebSocket from "ws";
import { resolveCountryCode, resolveNationality } from "@/lib/crm/countries";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import { isPlaceholderTraveler, type PersonName } from "@/lib/crm/person-match";
import { isSameDocumentPiece, reusableDocumentsForTraveler, tripDocumentsForTraveler } from "@/lib/crm/trip-documents";
import { DOC_TYPE_LABELS, type CrmBookingTraveler, type CrmTravelDocument, type TravelDocType } from "@/lib/crm/types";
import { signedCrmUrl } from "@/lib/crm/files";
import { createServiceClient } from "@/lib/supabase/admin";

/** Durée de l’URL du scan. Même fenêtre que `/api/files`. */
export const SCAN_URL_SECONDS = 600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOURNAL_REFERENCE = /^TB-[A-Za-z0-9-]{1,30}$/i;
const IDENTITY = new Set<TravelDocType>(["passport", "id_card"]);

const PERSON_COLUMNS = "id, first_name, last_name, usage_name, birth_date, sex, nationality";
const DOC_COLUMNS =
  "id, customer_id, companion_id, booking_id, traveler_id, doc_type, number, issuing_country, issued_on, expires_on, first_name, last_name, usage_name, birth_date, nationality, sex, place_of_birth, storage_path, file_name, mime_type, created_at";
const TRAVELER_COLUMNS = "id, booking_id, companion_id, is_account_holder, first_name, last_name, created_at";

/** Refus renvoyé tel quel. Le message ne contient aucune pièce. */
export class McpReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpReadError";
  }
}

export type PassportOutcome = "ok" | "refuse" | "introuvable" | "invalide" | "choix" | "erreur";

export type PasseportPiece = {
  nom: string | null;
  prenoms: string | null;
  nom_usage: string | null;
  noms_sur_piece: boolean;
  date_naissance: string | null;
  sexe: "M" | "F" | "X" | null;
  nationalite: string | null;
  type: string;
  numero_piece: string | null;
  pays_emission: string | null;
  delivre_le: string | null;
  expire_le: string | null;
  lieu_naissance: string | null;
  /** Vrai si un fichier est au coffre. Le chemin ne sort pas. */
  a_un_scan: boolean;
};

export type ScanFichier = {
  type: string;
  lieu_naissance: string | null;
  pays_emission: string | null;
  expire_le: string | null;
  fichier: string;
  type_mime: string;
  pdf: boolean;
  url_signee: string;
  expire_dans: number;
  note?: string;
};

export type ScanSigner = (path: string) => Promise<string>;

export type PasseportVoyageur = {
  voyageur_id: string;
  role: "titulaire" | "accompagnateur" | "voyageur";
  nom: string | null;
  prenoms: string | null;
  pieces: PasseportPiece[];
};

type BioRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  usage_name?: string | null;
  birth_date?: string | null;
  sex?: string | null;
  nationality?: string | null;
};

type PersonBio = {
  id: string;
  role: PasseportVoyageur["role"];
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  birth_date: string | null;
  sex: string | null;
  nationality: string | null;
};

type BookingHit = { id: string; reference: string; title: string | null; customer_id: string };

export type PassportQuery =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "client"; customerId: string }
  | { kind: "dossier"; dossierId?: string; reference?: string; customerId?: string };

type AuditRow = {
  actor: string;
  customer_id: string | null;
  booking_id: string | null;
  reference: string | null;
  outcome: PassportOutcome;
  traveler_count: number;
  /** `lecture` : données APIS. `scan` : URL du fichier. */
  kind: "lecture" | "scan";
};

function openDb() {
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function logDb(scope: string, error: { code?: string } | null | undefined) {
  console.error("[mcp] passeport", scope, error?.code ?? "?");
}

function clean(value: string | null | undefined) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function pieceNumber(value: string | null | undefined) {
  const text = (value || "").replace(/\s+/g, "").trim();
  return text || null;
}

function isoDay(value: string | null | undefined) {
  if (!value) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function sexCode(value: string | null | undefined): "M" | "F" | "X" | null {
  const code = (value || "").trim().toUpperCase();
  if (code === "M" || code === "F" || code === "X") return code;
  return null;
}

/** Référence d’agence seulement. Un texte libre (un numéro collé par erreur) ne va pas au journal. */
export function journalReference(value: string | null | undefined) {
  const ref = (value || "").trim();
  if (!JOURNAL_REFERENCE.test(ref)) return null;
  return ref;
}

export function parsePassportQuery(input: {
  client_id?: string;
  dossier_id?: string;
  reference?: string;
}): PassportQuery {
  const customerId = (input.client_id || "").trim();
  const dossierId = (input.dossier_id || "").trim();
  const reference = (input.reference || "").trim();
  if (!customerId && !dossierId && !reference) return { kind: "missing" };
  if ((customerId && !UUID.test(customerId)) || (dossierId && !UUID.test(dossierId)) || reference.length > 80) {
    return { kind: "invalid" };
  }
  if (dossierId || reference) {
    return {
      kind: "dossier",
      dossierId: dossierId || undefined,
      reference: reference || undefined,
      customerId: customerId || undefined,
    };
  }
  return { kind: "client", customerId };
}

function queryIds(query: PassportQuery) {
  if (query.kind === "client") return { customerId: query.customerId, bookingId: null as string | null, reference: null as string | null };
  if (query.kind === "dossier") {
    return { customerId: query.customerId ?? null, bookingId: query.dossierId ?? null, reference: query.reference ?? null };
  }
  return { customerId: null, bookingId: null, reference: null };
}

function auditRow(
  actor: string,
  query: PassportQuery,
  outcome: PassportOutcome,
  travelerCount: number,
  resolved?: { customerId?: string | null; bookingId?: string | null; reference?: string | null },
  kind: AuditRow["kind"] = "lecture"
): AuditRow {
  const requested = queryIds(query);
  return {
    actor: actor.slice(0, 40),
    customer_id: resolved?.customerId ?? requested.customerId,
    booking_id: resolved?.bookingId ?? requested.bookingId,
    reference: journalReference(resolved?.reference ?? requested.reference),
    outcome,
    traveler_count: travelerCount,
    kind,
  };
}

async function writeAudit(admin: SupabaseClient, row: AuditRow) {
  if (row.outcome === "ok") {
    // Historique du dossier et alerte informative : un passeport a été lu, sans numéro.
    await recordAgencyJournal({
      staffId: null,
      action: "reveal",
      entityType: "document",
      entityId: row.booking_id,
      summary: `Passeport ${row.kind === "scan" ? "ouvert (fichier)" : "lu (données APIS)"} par le connecteur ${row.actor}.`,
      sensitive: "passport_reveal",
      kind: "passeport_ouvert",
      bookingId: row.booking_id,
      actorLabel: row.actor,
      path: "/api/mcp",
    });
  }
  const payload = {
    actor: row.actor,
    customer_id: row.customer_id,
    booking_id: row.booking_id,
    reference: row.reference,
    outcome: row.outcome,
    traveler_count: row.traveler_count,
    kind: row.kind,
  };
  const first = await admin.from("crm_mcp_passport_reads").insert(payload);
  if (!first.error) return;
  const missingKind = first.error.code === "PGRST204" || first.error.code === "42703";
  if (missingKind) {
    const { kind: _kind, ...withoutKind } = payload;
    const second = await admin.from("crm_mcp_passport_reads").insert(withoutKind);
    if (!second.error) return;
    logDb("journal", second.error);
    return;
  }
  logDb("journal", first.error);
}

function bio(row: BioRow, role: PersonBio["role"], id = row.id): PersonBio {
  return {
    id,
    role,
    first_name: row.first_name,
    last_name: row.last_name,
    usage_name: row.usage_name ?? null,
    birth_date: row.birth_date ?? null,
    sex: row.sex ?? null,
    nationality: row.nationality ?? null,
  };
}

function asDocument(row: Record<string, unknown>): CrmTravelDocument {
  return {
    id: String(row.id),
    customer_id: String(row.customer_id),
    companion_id: (row.companion_id as string | null) ?? null,
    booking_id: (row.booking_id as string | null) ?? null,
    traveler_id: (row.traveler_id as string | null) ?? null,
    doc_type: row.doc_type as TravelDocType,
    number: (row.number as string | null) ?? null,
    issuing_country: (row.issuing_country as string | null) ?? null,
    issued_on: (row.issued_on as string | null) ?? null,
    expires_on: (row.expires_on as string | null) ?? null,
    first_name: (row.first_name as string | null) ?? null,
    last_name: (row.last_name as string | null) ?? null,
    usage_name: (row.usage_name as string | null) ?? null,
    birth_date: (row.birth_date as string | null) ?? null,
    nationality: (row.nationality as string | null) ?? null,
    sex: (row.sex as string | null) ?? null,
    place_of_birth: (row.place_of_birth as string | null) ?? null,
    authority: null,
    personal_number: null,
    storage_path: (row.storage_path as string | null) ?? null,
    file_name: (row.file_name as string | null) ?? null,
    mime_type: (row.mime_type as string | null) ?? null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.created_at || ""),
  };
}

function asTraveler(row: Record<string, unknown>): CrmBookingTraveler {
  return {
    id: String(row.id),
    booking_id: String(row.booking_id),
    companion_id: (row.companion_id as string | null) ?? null,
    is_account_holder: row.is_account_holder === true,
    first_name: (row.first_name as string | null) ?? null,
    last_name: (row.last_name as string | null) ?? null,
    created_at: String(row.created_at || ""),
  };
}

function toPiece(doc: CrmTravelDocument, person: PersonBio): PasseportPiece {
  const nomPiece = clean(doc.last_name);
  const prenomsPiece = clean(doc.first_name);
  return {
    nom: nomPiece || clean(person.last_name),
    prenoms: prenomsPiece || clean(person.first_name),
    nom_usage: clean(doc.usage_name) || clean(person.usage_name),
    noms_sur_piece: Boolean(nomPiece && prenomsPiece),
    date_naissance: isoDay(doc.birth_date) || isoDay(person.birth_date),
    sexe: sexCode(doc.sex) || sexCode(person.sex),
    nationalite: resolveNationality(doc.nationality, doc.issuing_country) || resolveNationality(person.nationality),
    type: DOC_TYPE_LABELS[doc.doc_type],
    numero_piece: pieceNumber(doc.number),
    pays_emission: resolveCountryCode(doc.issuing_country),
    delivre_le: isoDay(doc.issued_on),
    expire_le: isoDay(doc.expires_on),
    lieu_naissance: clean(doc.place_of_birth),
    a_un_scan: Boolean(passportScanPath(doc.customer_id, doc.storage_path)),
  };
}

/** Fichier de pièce d’identité : seulement le dossier du client, un seul segment. */
export function passportScanPath(customerId: string, path: string | null | undefined) {
  if (!customerId || !path) return null;
  const prefix = `customers/${customerId}/documents/`;
  const lowerPrefix = prefix.toLowerCase();
  if (!path.toLowerCase().startsWith(lowerPrefix)) return null;
  const rest = path.slice(lowerPrefix.length);
  if (!rest || /[\\/]/.test(rest) || rest.includes("..") || /%(2e|2f|5c)/i.test(rest)) return null;
  return path;
}

const BLANK_FILL = [
  "issued_on",
  "first_name",
  "last_name",
  "usage_name",
  "birth_date",
  "nationality",
  "sex",
  "place_of_birth",
  "number",
  "expires_on",
  "issuing_country",
] as const;

/** La copie la plus récente ne doit pas cacher la délivrance, les noms ou le lieu de l’autre. */
function fillBlankScan(winner: CrmTravelDocument, other: CrmTravelDocument) {
  const next: CrmTravelDocument = { ...winner };
  let changed = false;
  for (const key of BLANK_FILL) {
    const incoming = other[key] ?? null;
    if (!clean(winner[key]) && clean(incoming)) {
      next[key] = incoming;
      changed = true;
    }
  }
  const path = passportScanPath(winner.customer_id, winner.storage_path)
    ? winner.storage_path
    : passportScanPath(other.customer_id, other.storage_path);
  if (path !== winner.storage_path) {
    const source = path && path === other.storage_path ? other : winner;
    next.storage_path = path;
    next.file_name = source.file_name;
    next.mime_type = source.mime_type;
    changed = true;
  }
  return changed ? next : winner;
}

function preferPiece(current: CrmTravelDocument, candidate: CrmTravelDocument) {
  const expiry = (candidate.expires_on || "").localeCompare(current.expires_on || "");
  const winner =
    expiry !== 0
      ? expiry > 0
        ? candidate
        : current
      : !current.booking_id !== !candidate.booking_id
        ? !candidate.booking_id
          ? candidate
          : current
        : (candidate.created_at || "").localeCompare(current.created_at || "") > 0
          ? candidate
          : current;
  return fillBlankScan(winner, winner === current ? candidate : current);
}

function dedupePieces(docs: CrmTravelDocument[]) {
  const unique: CrmTravelDocument[] = [];
  for (const doc of docs) {
    if (!IDENTITY.has(doc.doc_type)) continue;
    const index = unique.findIndex((kept) => isSameDocumentPiece(kept, doc));
    if (index === -1) unique.push(doc);
    else unique[index] = preferPiece(unique[index], doc);
  }
  return unique.sort((a, b) => {
    const rank = Number(a.doc_type !== "passport") - Number(b.doc_type !== "passport");
    if (rank) return rank;
    const expiry = (b.expires_on || "").localeCompare(a.expires_on || "");
    if (expiry) return expiry;
    return (b.issued_on || "").localeCompare(a.issued_on || "");
  });
}

/** Coffre de la fiche. La copie de séjour ne sert que s’il n’y a pas de coffre. */
function piecesForPerson(docs: CrmTravelDocument[], companionId: string | null) {
  const mine = docs.filter(
    (doc) => IDENTITY.has(doc.doc_type) && (companionId ? doc.companion_id === companionId : !doc.companion_id)
  );
  const vault = mine.filter((doc) => !doc.booking_id);
  return dedupePieces(vault.length ? vault : mine);
}

function piecesForTraveler(docs: CrmTravelDocument[], traveler: CrmBookingTraveler, holder: PersonName) {
  const seen = new Set<string>();
  const pool: CrmTravelDocument[] = [];
  for (const doc of [...tripDocumentsForTraveler(docs, traveler), ...reusableDocumentsForTraveler(docs, traveler, holder)]) {
    if (!IDENTITY.has(doc.doc_type) || seen.has(doc.id)) continue;
    seen.add(doc.id);
    pool.push(doc);
  }
  return dedupePieces(pool);
}

function byName(a: BioRow, b: BioRow) {
  return (
    (a.last_name || "").localeCompare(b.last_name || "", "fr") ||
    (a.first_name || "").localeCompare(b.first_name || "", "fr")
  );
}

export function householdVoyageurs(customer: BioRow, companions: BioRow[], docs: CrmTravelDocument[]): PasseportVoyageur[] {
  const people = [customer, ...companions.slice().sort(byName)];
  return people.map((row, index) => {
    const role = index === 0 ? "titulaire" : "accompagnateur";
    const person = bio(row, role);
    return {
      voyageur_id: row.id,
      role,
      nom: clean(row.last_name),
      prenoms: clean(row.first_name),
      pieces: piecesForPerson(docs, role === "titulaire" ? null : row.id).map((doc) => toPiece(doc, person)),
    };
  });
}

function profileForTraveler(traveler: CrmBookingTraveler, customer: BioRow, companion?: BioRow): PersonBio {
  if (traveler.is_account_holder) return bio(customer, "titulaire", traveler.id);
  if (companion) return bio(companion, "accompagnateur", traveler.id);
  return {
    id: traveler.id,
    role: traveler.companion_id ? "accompagnateur" : "voyageur",
    first_name: traveler.first_name,
    last_name: traveler.last_name,
    usage_name: null,
    birth_date: null,
    sex: null,
    nationality: null,
  };
}

export function dossierVoyageurs(
  travelers: CrmBookingTraveler[],
  customer: BioRow,
  companions: BioRow[],
  docs: CrmTravelDocument[]
): PasseportVoyageur[] {
  const holder = {
    first_name: customer.first_name,
    last_name: customer.last_name,
    usage_name: customer.usage_name ?? null,
  };
  const byCompanion = new Map(companions.map((row) => [row.id, row]));
  const out: PasseportVoyageur[] = [];
  for (const traveler of travelers) {
    if (isPlaceholderTraveler(traveler.first_name, traveler.last_name)) continue;
    if (!clean(traveler.first_name) && !clean(traveler.last_name) && !traveler.is_account_holder && !traveler.companion_id) {
      continue;
    }
    const person = profileForTraveler(traveler, customer, traveler.companion_id ? byCompanion.get(traveler.companion_id) : undefined);
    out.push({
      voyageur_id: traveler.id,
      role: person.role,
      nom: clean(traveler.last_name) || clean(person.last_name),
      prenoms: clean(traveler.first_name) || clean(person.first_name),
      pieces: piecesForTraveler(docs, traveler, holder).map((doc) => toPiece(doc, person)),
    });
  }
  return out;
}

async function loadIdentity(admin: SupabaseClient, customerId: string) {
  const [companions, documents] = await Promise.all([
    admin.from("crm_travel_companions").select(PERSON_COLUMNS).eq("customer_id", customerId),
    admin.from("crm_travel_documents").select(DOC_COLUMNS).eq("customer_id", customerId).in("doc_type", ["passport", "id_card"]).limit(80),
  ]);
  if (companions.error || documents.error) {
    logDb("pieces", companions.error || documents.error);
    return null;
  }
  return {
    companions: (companions.data || []) as BioRow[],
    documents: ((documents.data || []) as Record<string, unknown>[]).map(asDocument),
  };
}

async function readClient(admin: SupabaseClient, actor: string, query: Extract<PassportQuery, { kind: "client" }>) {
  const { data, error } = await admin.from("crm_customers").select(PERSON_COLUMNS).eq("id", query.customerId).maybeSingle();
  if (error) {
    logDb("client", error);
    await writeAudit(admin, auditRow(actor, query, "erreur", 0));
    throw new Error("Lecture impossible.");
  }
  if (!data) {
    await writeAudit(admin, auditRow(actor, query, "introuvable", 0));
    return { introuvable: true as const };
  }
  const loaded = await loadIdentity(admin, query.customerId);
  if (!loaded) {
    await writeAudit(admin, auditRow(actor, query, "erreur", 0));
    throw new Error("Lecture impossible.");
  }
  const voyageurs = householdVoyageurs(data as BioRow, loaded.companions, loaded.documents);
  await writeAudit(admin, auditRow(actor, query, "ok", voyageurs.length));
  return { client_id: query.customerId, voyageurs };
}

async function readDossier(admin: SupabaseClient, actor: string, query: Extract<PassportQuery, { kind: "dossier" }>) {
  let bookingQuery = admin.from("crm_bookings").select("id, reference, title, customer_id");
  bookingQuery = query.dossierId ? bookingQuery.eq("id", query.dossierId) : bookingQuery.eq("reference", query.reference || "");
  const { data, error } = await bookingQuery.limit(2);
  if (error) {
    logDb("dossier", error);
    await writeAudit(admin, auditRow(actor, query, "erreur", 0));
    throw new Error("Lecture impossible.");
  }
  const rows = (data || []) as BookingHit[];
  if (!rows.length) {
    await writeAudit(admin, auditRow(actor, query, "introuvable", 0));
    return { introuvable: true as const };
  }
  if (rows.length > 1) {
    await writeAudit(admin, auditRow(actor, query, "choix", 0));
    return {
      message: "Plusieurs dossiers correspondent. Précisez l’identifiant.",
      choix: rows.map((row) => ({ id: row.id, reference: row.reference, titre: row.title })),
    };
  }
  const booking = rows[0];
  const resolved = { customerId: booking.customer_id, bookingId: booking.id, reference: booking.reference };
  if (query.customerId && query.customerId !== booking.customer_id) {
    await writeAudit(admin, auditRow(actor, query, "invalide", 0, { bookingId: booking.id, reference: booking.reference }));
    return { message: "Ce dossier n’appartient pas à ce client." };
  }
  const [travelers, customerResult, loaded] = await Promise.all([
    admin.from("crm_booking_travelers").select(TRAVELER_COLUMNS).eq("booking_id", booking.id).order("created_at"),
    admin.from("crm_customers").select(PERSON_COLUMNS).eq("id", booking.customer_id).maybeSingle(),
    loadIdentity(admin, booking.customer_id),
  ]);
  if (travelers.error || customerResult.error || !loaded) {
    logDb("voyageurs", travelers.error || customerResult.error);
    await writeAudit(admin, auditRow(actor, query, "erreur", 0, resolved));
    throw new Error("Lecture impossible.");
  }
  const customer = (customerResult.data as BioRow | null) || {
    id: booking.customer_id,
    first_name: null,
    last_name: null,
  };
  const voyageurs = dossierVoyageurs(
    ((travelers.data || []) as Record<string, unknown>[]).map(asTraveler),
    customer,
    loaded.companions,
    loaded.documents
  );
  await writeAudit(admin, auditRow(actor, query, "ok", voyageurs.length, resolved));
  return {
    client_id: booking.customer_id,
    dossier: { id: booking.id, reference: booking.reference, titre: booking.title },
    voyageurs,
  };
}

export async function readPasseportVoyageur(
  input: { client_id?: string; dossier_id?: string; reference?: string },
  admin?: SupabaseClient
) {
  const db = admin ?? openDb();
  const access = currentMcpAccess();
  const query = parsePassportQuery(input);
  if (!access.passport) {
    await writeAudit(db, auditRow(access.actor, query, "refuse", 0));
    throw new McpReadError("Cet assistant n’est pas autorisé à lire les passeports.");
  }
  if (query.kind === "missing") {
    await writeAudit(db, auditRow(access.actor, query, "invalide", 0));
    return { message: "Indiquez un identifiant client, un identifiant de dossier ou une référence." };
  }
  if (query.kind === "invalid") {
    await writeAudit(db, auditRow(access.actor, query, "invalide", 0));
    return { message: "Identifiant inconnu." };
  }
  if (query.kind === "client") return readClient(db, access.actor, query);
  return readDossier(db, access.actor, query);
}

const PHOTO_MIME = new Set(["image/jpeg", "image/jpg", "image/png"]);

export type ScanQuery =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "dossier"; dossierId?: string; reference?: string; customerId?: string; voyageurId?: string };

export function parseScanQuery(input: {
  client_id?: string;
  dossier_id?: string;
  reference?: string;
  voyageur_id?: string;
}): ScanQuery {
  const voyageurId = (input.voyageur_id || "").trim();
  if (voyageurId && !UUID.test(voyageurId)) return { kind: "invalid" };
  const base = parsePassportQuery({
    client_id: input.client_id,
    dossier_id: input.dossier_id,
    reference: input.reference,
  });
  if (base.kind !== "dossier") return { kind: base.kind === "invalid" ? "invalid" : "missing" };
  return { ...base, voyageurId: voyageurId || undefined };
}

function mimeFromName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "heic" || ext === "heif") return "image/heic";
  if (ext === "webp") return "image/webp";
  return null;
}

function scanNote(mime: string) {
  if (mime === "application/pdf") return "Le scan est un PDF, pas une photo png, jpg ou jpeg.";
  if (PHOTO_MIME.has(mime)) return undefined;
  return "Le scan n’est pas une photo png, jpg ou jpeg.";
}

function scanMeta(doc: CrmTravelDocument) {
  const fichier =
    clean(doc.file_name) || doc.storage_path?.split("/").pop()?.replace(/^\d{10,}-/, "") || "passeport";
  let mime = (doc.mime_type || "").split(";")[0].trim().toLowerCase();
  if (!mime || mime === "application/octet-stream") mime = mimeFromName(fichier) || "application/octet-stream";
  return { fichier, type_mime: mime, pdf: mime === "application/pdf", note: scanNote(mime) };
}

async function signScan(path: string, sign: ScanSigner) {
  try {
    const url = await sign(path);
    if (!url) throw new Error("signature");
    return url;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "signature";
    logDb("signature", { code });
    throw new Error("Lecture impossible.");
  }
}

async function toScan(doc: CrmTravelDocument, sign: ScanSigner): Promise<ScanFichier> {
  const path = passportScanPath(doc.customer_id, doc.storage_path);
  if (!path) throw new Error("Lecture impossible.");
  const meta = scanMeta(doc);
  const scan: ScanFichier = {
    type: DOC_TYPE_LABELS.passport,
    lieu_naissance: clean(doc.place_of_birth),
    pays_emission: resolveCountryCode(doc.issuing_country),
    expire_le: isoDay(doc.expires_on),
    fichier: meta.fichier,
    type_mime: meta.type_mime,
    pdf: meta.pdf,
    url_signee: await signScan(path, sign),
    expire_dans: SCAN_URL_SECONDS,
  };
  if (meta.note) scan.note = meta.note;
  return scan;
}

function holderName(customer: BioRow): PersonName {
  return {
    first_name: customer.first_name,
    last_name: customer.last_name,
    usage_name: customer.usage_name ?? null,
  };
}

export async function readScanPasseport(
  input: { client_id?: string; dossier_id?: string; reference?: string; voyageur_id?: string },
  admin?: SupabaseClient,
  sign: ScanSigner = (path) => signedCrmUrl(path, SCAN_URL_SECONDS)
) {
  const db = admin ?? openDb();
  const access = currentMcpAccess();
  const query = parseScanQuery(input);
  const audit = (
    outcome: PassportOutcome,
    travelerCount: number,
    resolved?: { customerId?: string | null; bookingId?: string | null; reference?: string | null }
  ) => writeAudit(db, auditRow(access.actor, query, outcome, travelerCount, resolved, "scan"));
  if (!access.passport) {
    await audit("refuse", 0);
    throw new McpReadError("Cet assistant n’est pas autorisé à lire les passeports.");
  }
  if (query.kind === "missing") {
    await audit("invalide", 0);
    return { message: "Indiquez un identifiant de dossier ou une référence." };
  }
  if (query.kind === "invalid") {
    await audit("invalide", 0);
    return { message: "Identifiant inconnu." };
  }
  let bookingQuery = db.from("crm_bookings").select("id, reference, title, customer_id");
  bookingQuery = query.dossierId ? bookingQuery.eq("id", query.dossierId) : bookingQuery.eq("reference", query.reference || "");
  const { data, error } = await bookingQuery.limit(2);
  if (error) {
    logDb("dossier", error);
    await audit("erreur", 0);
    throw new Error("Lecture impossible.");
  }
  const rows = (data || []) as BookingHit[];
  if (!rows.length) {
    await audit("introuvable", 0);
    return { introuvable: true as const };
  }
  if (rows.length > 1) {
    await audit("choix", 0);
    return {
      message: "Plusieurs dossiers correspondent. Précisez l’identifiant.",
      choix: rows.map((row) => ({ id: row.id, reference: row.reference, titre: row.title })),
    };
  }
  const booking = rows[0];
  const resolved = { customerId: booking.customer_id, bookingId: booking.id, reference: booking.reference };
  const dossier = { id: booking.id, reference: booking.reference, titre: booking.title };
  if (query.customerId && query.customerId !== booking.customer_id) {
    await audit("invalide", 0, { bookingId: booking.id, reference: booking.reference });
    return { message: "Ce dossier n’appartient pas à ce client." };
  }
  const [travelers, customerResult, loaded] = await Promise.all([
    db.from("crm_booking_travelers").select(TRAVELER_COLUMNS).eq("booking_id", booking.id).order("created_at"),
    db.from("crm_customers").select(PERSON_COLUMNS).eq("id", booking.customer_id).maybeSingle(),
    loadIdentity(db, booking.customer_id),
  ]);
  if (travelers.error || customerResult.error || !loaded) {
    logDb("voyageurs", travelers.error || customerResult.error);
    await audit("erreur", 0, resolved);
    throw new Error("Lecture impossible.");
  }
  const customer = (customerResult.data as BioRow | null) || {
    id: booking.customer_id,
    first_name: null,
    last_name: null,
  };
  const travelerRows = ((travelers.data || []) as Record<string, unknown>[]).map(asTraveler);
  const voyageurs = dossierVoyageurs(travelerRows, customer, loaded.companions, loaded.documents);
  let chosen = voyageurs;
  if (query.voyageurId) {
    const row = travelerRows.find((traveler) => traveler.id === query.voyageurId || traveler.companion_id === query.voyageurId);
    chosen = row ? voyageurs.filter((voyageur) => voyageur.voyageur_id === row.id) : [];
    if (!chosen.length) {
      await audit("introuvable", 0, resolved);
      return { message: "Ce voyageur n’est pas sur ce dossier.", dossier };
    }
  } else if (voyageurs.length !== 1) {
    await audit(voyageurs.length ? "choix" : "introuvable", voyageurs.length, resolved);
    if (!voyageurs.length) return { message: "Aucun voyageur sur ce dossier.", dossier };
    return {
      message: "Plusieurs voyageurs. Précisez voyageur_id.",
      dossier,
      voyageurs: voyageurs.map((voyageur) => ({
        voyageur_id: voyageur.voyageur_id,
        nom: voyageur.nom,
        prenoms: voyageur.prenoms,
        a_un_scan: voyageur.pieces.some((piece) => piece.type === "Passeport" && piece.a_un_scan),
      })),
    };
  }
  const voyageur = chosen[0];
  const traveler = travelerRows.find((row) => row.id === voyageur.voyageur_id);
  if (!traveler) {
    await audit("erreur", 0, resolved);
    throw new Error("Lecture impossible.");
  }
  const passports = piecesForTraveler(loaded.documents, traveler, holderName(customer)).filter(
    (doc) => doc.doc_type === "passport"
  );
  const head = {
    client_id: booking.customer_id,
    dossier,
    voyageur_id: voyageur.voyageur_id,
    nom: voyageur.nom,
    prenoms: voyageur.prenoms,
  };
  if (!passports.length) {
    await audit("ok", 1, resolved);
    return { ...head, scans: [], message: "Aucun passeport n’est enregistré pour ce voyageur." };
  }
  const withFile = passports.filter((doc) => passportScanPath(doc.customer_id, doc.storage_path));
  if (!withFile.length) {
    await audit("ok", 1, resolved);
    return {
      ...head,
      lieu_naissance: clean(passports[0].place_of_birth),
      scans: [],
      message: "Aucun scan n’est enregistré pour ce passeport.",
    };
  }
  try {
    const scans: ScanFichier[] = [];
    for (const doc of withFile) scans.push(await toScan(doc, sign));
    await audit("ok", 1, resolved);
    return { ...head, scans };
  } catch (err) {
    await audit("erreur", 0, resolved);
    if (err instanceof Error && err.message === "Lecture impossible.") throw err;
    throw new Error("Lecture impossible.");
  }
}
