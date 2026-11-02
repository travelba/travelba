import type { SupabaseClient } from "@supabase/supabase-js";
import { roleAllows } from "@/lib/crm/agency-access";
import { JOURNAL_ACTIONS, JOURNAL_ENTITIES, type JournalAction, type JournalEntity } from "@/lib/crm/agency-journal";
import { saveCustomerBillingCompanies } from "@/lib/crm/billing-companies";
import { addStaffBookingCard, patchStaffBookingCard } from "@/lib/crm/booking-item-write";
import { setCarnetPublished, syncBookingLedger, syncBookingTotalFromItems } from "@/lib/crm/bookings";
import { customerDeleteConfirmed, DELETE_CUSTOMER_CONFIRM_ERROR } from "@/lib/crm/delete-confirm";
import { CustomerDeleteError, deleteCustomerById } from "@/lib/crm/delete-customer";
import { persistBookingCardOrder } from "@/lib/crm/item-order";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import { decodeUploadedBytes } from "@/lib/crm/mcp-piece";
import { McpWriteError } from "@/lib/crm/mcp-write";
import type { StaffRole } from "@/lib/crm/staff-team";
import { BOOKING_ITEM_KINDS, customerFullName, type BookingItemKind, type CrmBooking } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";
import { attachBookingDocument, removeBookingDocument } from "@/lib/crm/booking-document-write";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONFIRM = "Confirmation requise : confirmer true.";

const KIND_INPUT: Record<string, BookingItemKind> = {
  vol: "flight",
  flight: "flight",
  hotel: "hotel",
  transfert: "transfer",
  transfer: "transfer",
  activite: "activity",
  activity: "activity",
  train: "rail",
  rail: "rail",
  voiture: "car",
  car: "car",
  bateau: "cruise",
  cruise: "cruise",
  assurance: "insurance",
  insurance: "insurance",
  frais: "fee",
  fee: "fee",
  chauffeur: "chauffeur",
  vip: "greeter",
  greeter: "greeter",
  visa: "visa",
  enregistrement: "checkin",
  checkin: "checkin",
  depense: "expense",
  expense: "expense",
  accueil_vip: "accueil_vip",
  accueil: "accueil_vip",
};

const SECRET_KEY = /passport|mrz|numero|personal_number|iban|pan|cvc|cvv|card_number/i;

type Row = Record<string, unknown>;

type BookingHit = { id: string; reference: string; visible_to_client?: boolean | null; archived_at?: string | null; status?: string | null };

export type DeskDeps = {
  admin?: SupabaseClient;
  loadCustomer?: (id: string) => Promise<{ first_name?: string | null; last_name?: string | null } | null>;
  deleteCustomer?: (id: string) => Promise<{ ok: true; name: string }>;
  saveCompanies?: typeof saveCustomerBillingCompanies;
  writeHotelAccess?: (input: {
    actor: "admin";
    staffId: string | null;
    customerId: string;
    enabled: boolean;
    demo: boolean;
    live: boolean;
  }) => Promise<{ ok: true; enabled: boolean; live: boolean } | { ok: false; error: string }>;
  reviewHotelAccess?: (input: {
    actor: "admin";
    staffId: string | null;
    customerId: string;
    decision: "accept" | "refuse";
  }) => Promise<{ ok: true; enabled: boolean; status: string } | { ok: false; error: string }>;
  findBooking?: (target: { id: string; reference: string }) => Promise<BookingHit>;
  archive?: (id: string) => Promise<{ reference?: string | null }>;
  restore?: (id: string) => Promise<{ booking: { id: string; reference: string } }>;
  duplicate?: (id: string) => Promise<{ booking: { id: string; reference: string } }>;
  stampCreator?: (bookingId: string, staffId: string) => Promise<void>;
  hideCarnet?: (admin: SupabaseClient, bookingId: string) => Promise<void>;
  syncLedger?: (admin: SupabaseClient, bookingId: string) => Promise<void>;
  addCard?: typeof addStaffBookingCard;
  patchCard?: typeof patchStaffBookingCard;
  reorder?: typeof persistBookingCardOrder;
  attach?: typeof attachBookingDocument;
  removeDoc?: typeof removeBookingDocument;
  readJournal?: (query: JournalQuery) => Promise<JournalPage>;
};

export type JournalQuery = {
  entity: JournalEntity | null;
  id: string | null;
  action: JournalAction | null;
  limit: number;
};

export type JournalPage = {
  lignes: {
    seq: number;
    quand: string;
    auteur: string;
    action: string;
    entite: string;
    entite_id: string | null;
    resume: string;
  }[];
  chaine_intacte: boolean | null;
};

function db(admin?: SupabaseClient) {
  return admin ?? createServiceClient();
}

function text(value: unknown, max = 300) {
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

function confirmed(input: Record<string, unknown>) {
  if (input.confirmer !== true) throw new McpWriteError(CONFIRM);
}

function kindOf(value: unknown) {
  const key = text(value, 40)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const kind = KIND_INPUT[key];
  if (!kind || !(BOOKING_ITEM_KINDS as readonly string[]).includes(kind)) return null;
  return kind;
}

function rejectSecretKeys(value: unknown, depth = 0) {
  if (depth > 6 || !value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) {
      throw new McpWriteError("Les numéros de pièce et de carte ne passent pas par cet outil.");
    }
    rejectSecretKeys(child, depth + 1);
  }
}

/** Journal entier : droit « Voir le journal ». Un client ou un dossier reste lisible par l’agence. */
export function journalReadDenial(
  staff: { role: string; allows?: Record<string, boolean> | null } | null | undefined,
  scoped: boolean
) {
  if (!staff || scoped) return null;
  const allowed =
    staff.allows && typeof staff.allows.view_journal === "boolean"
      ? staff.allows.view_journal
      : staff.role === "admin" ||
          staff.role === "manager" ||
          staff.role === "agent" ||
          staff.role === "comptable" ||
          staff.role === "lecture"
        ? roleAllows(staff.role as StaffRole, "view_journal", null)
        : false;
  return allowed
    ? null
    : "Le journal de l’agence demande le droit de le consulter. Indiquez un client ou un dossier.";
}

async function findBooking(admin: SupabaseClient, target: { id: string; reference: string }): Promise<BookingHit> {
  let query = admin.from("crm_bookings").select("id, reference, visible_to_client, archived_at, status");
  query = target.id ? query.eq("id", target.id) : query.eq("reference", target.reference);
  const { data, error } = await query.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const rows = (data || []) as BookingHit[];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0];
}

async function bookingOf(input: Record<string, unknown>, deps: DeskDeps) {
  const target = dossierTarget(input);
  if (deps.findBooking) return deps.findBooking(target);
  return findBooking(db(deps.admin), target);
}

function mapCompany(entry: unknown) {
  if (!entry || typeof entry !== "object") throw new McpWriteError("Société invalide.");
  const row = entry as Record<string, unknown>;
  return {
    id: row.id,
    company_name: row.raison_sociale ?? row.company_name,
    siret: row.siret,
    vat_number: row.tva ?? row.vat_number,
    billing_email: row.email ?? row.billing_email,
    billing_address_line: row.adresse ?? row.billing_address_line,
    billing_postal_code: row.code_postal ?? row.billing_postal_code,
    billing_city: row.ville ?? row.billing_city,
    billing_country: row.pays ?? row.billing_country,
  };
}

function publicCompany(row: Row) {
  return {
    id: row.id,
    raison_sociale: row.company_name ?? null,
    ville: row.billing_city ?? null,
  };
}

/** Suppression définitive, comme le bouton admin : le nom complet confirme. */
export async function supprimerClient(input: Record<string, unknown>, deps: DeskDeps = {}) {
  const id = requireUuid(input.client_id || input.id, "Client");
  const load =
    deps.loadCustomer ??
    (async (customerId: string) => {
      const { data, error } = await db(deps.admin)
        .from("crm_customers")
        .select("first_name, last_name")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw new McpWriteError("Client introuvable.");
      return data as { first_name?: string | null; last_name?: string | null } | null;
    });
  const customer = await load(id);
  if (!customer) throw new McpWriteError("Client introuvable.");
  if (
    !customerDeleteConfirmed(
      input.confirmer,
      customerFullName({
        first_name: customer.first_name || "",
        last_name: customer.last_name || "",
      })
    )
  ) {
    throw new McpWriteError(DELETE_CUSTOMER_CONFIRM_ERROR);
  }
  const remove = deps.deleteCustomer ?? ((customerId: string) => deleteCustomerById(customerId, deps.admin ? { admin: deps.admin } : undefined));
  try {
    const result = await remove(id);
    return { supprime: true, client_id: id, nom: result.name };
  } catch (err) {
    if (err instanceof CustomerDeleteError || err instanceof McpWriteError) {
      throw err instanceof McpWriteError ? err : new McpWriteError(err.message);
    }
    throw new McpWriteError("Suppression impossible.");
  }
}

/** La liste remplace les sociétés de facturation, comme Enregistrer sur la fiche. */
export async function enregistrerSocietes(input: Record<string, unknown>, deps: DeskDeps = {}) {
  confirmed(input);
  const id = requireUuid(input.client_id, "Client");
  if (!Array.isArray(input.societes)) throw new McpWriteError("Liste de sociétés invalide.");
  const payload = input.societes.map(mapCompany);
  const save = deps.saveCompanies ?? saveCustomerBillingCompanies;
  const saved = await save(db(deps.admin), id, payload);
  if ("error" in saved) throw new McpWriteError(saved.error);
  return {
    client_id: id,
    societes: saved.companies.map((row) => publicCompany(row as unknown as Row)),
  };
}

/** Interrupteur Accès Hôtels, ou accepter / refuser une demande. Réservé aux administrateurs. */
export async function reglerAccesHotels(input: Record<string, unknown>, deps: DeskDeps = {}) {
  const id = requireUuid(input.client_id, "Client");
  const staffId = currentMcpAccess().staff?.id ?? null;
  const demande = text(input.demande, 20);
  if (demande === "accepter" || demande === "refuser") {
    const review =
      deps.reviewHotelAccess ??
      (await import("@/lib/crm/hotel-access-run")).reviewHotelAccess;
    const result = await review({
      actor: "admin",
      staffId,
      customerId: id,
      decision: demande === "accepter" ? "accept" : "refuse",
    });
    if (!result.ok) throw new McpWriteError(result.error);
    return { client_id: id, actif: result.enabled, demande: result.status };
  }
  if (typeof input.actif !== "boolean") {
    throw new McpWriteError("Indiquez actif, ou une demande accepter ou refuser.");
  }
  const write = deps.writeHotelAccess ?? (await import("@/lib/crm/hotel-access-run")).writeHotelAccess;
  const result = await write({
    actor: "admin",
    staffId,
    customerId: id,
    enabled: input.actif,
    demo: false,
    live: input.mode_reel === true,
  });
  if (!result.ok) throw new McpWriteError(result.error);
  return { client_id: id, actif: result.enabled, mode_reel: result.live };
}

export async function archiverDossier(input: Record<string, unknown>, deps: DeskDeps = {}) {
  confirmed(input);
  const booking = await bookingOf(input, deps);
  const archive =
    deps.archive ??
    (async (id: string) => {
      const { archiveBookingById } = await import("@/lib/crm/archive-booking");
      return archiveBookingById(id);
    });
  try {
    const result = await archive(booking.id);
    return { archive: true, dossier_id: booking.id, reference: result.reference || booking.reference };
  } catch (err) {
    throw new McpWriteError(err instanceof McpWriteError ? err.message : err instanceof Error ? err.message : "Archivage impossible.");
  }
}

export async function restaurerDossier(input: Record<string, unknown>, deps: DeskDeps = {}) {
  const booking = await bookingOf(input, deps);
  const restore =
    deps.restore ??
    (async (id: string) => {
      const { restoreBookingById } = await import("@/lib/crm/archive-booking");
      return restoreBookingById(id);
    });
  try {
    const result = await restore(booking.id);
    return { restaure: true, dossier_id: result.booking.id, reference: result.booking.reference };
  } catch (err) {
    throw new McpWriteError(err instanceof Error ? err.message : "Réactivation impossible.");
  }
}

export async function dupliquerDossier(input: Record<string, unknown>, deps: DeskDeps = {}) {
  const booking = await bookingOf(input, deps);
  const duplicate =
    deps.duplicate ??
    (async (id: string) => {
      const { duplicateBookingById } = await import("@/lib/crm/duplicate-booking");
      return duplicateBookingById(id);
    });
  try {
    const result = await duplicate(booking.id);
    const staffId = currentMcpAccess().staff?.id;
    let avertissement: string | null = null;
    if (staffId) {
      const stamp =
        deps.stampCreator ??
        (async (bookingId: string, actorId: string) => {
          const { stampBookingCreator } = await import("@/lib/crm/dossier-responsables");
          await stampBookingCreator(db(deps.admin), {
            bookingId,
            staffId: actorId,
            path: "/api/mcp",
            summary: "Dossier créé par copie, via le connecteur.",
          });
        });
      try {
        await stamp(result.booking.id, staffId);
      } catch (err) {
        avertissement = err instanceof Error ? err.message : "Le responsable n’a pas été posé.";
      }
    }
    return {
      dossier_id: result.booking.id,
      reference: result.booking.reference,
      copie_de: booking.reference,
      avertissement,
    };
  } catch (err) {
    throw new McpWriteError(err instanceof Error ? err.message : "Copie impossible.");
  }
}

/** Cache le carnet et retire le débit ouvert. Aucun message. */
export async function cacherCarnet(input: Record<string, unknown>, deps: DeskDeps = {}) {
  confirmed(input);
  const booking = await bookingOf(input, deps);
  if (booking.visible_to_client === false) {
    return { deja_cache: true, dossier_id: booking.id, reference: booking.reference };
  }
  const admin = db(deps.admin);
  const hide = deps.hideCarnet ?? ((client: SupabaseClient, id: string) => setCarnetPublished(client, id, false));
  try {
    await hide(admin, booking.id);
    if (deps.syncLedger) await deps.syncLedger(admin, booking.id);
    else {
      await syncBookingTotalFromItems(admin, booking.id);
      const { data } = await admin.from("crm_bookings").select("*").eq("id", booking.id).maybeSingle();
      if (data) await syncBookingLedger(admin, data as CrmBooking);
    }
  } catch (err) {
    throw new McpWriteError(err instanceof Error ? err.message : "Le carnet n’a pas pu être caché.");
  }
  return { cache: true, dossier_id: booking.id, reference: booking.reference };
}

function cardBody(input: Record<string, unknown>, kind: BookingItemKind) {
  rejectSecretKeys(input.details);
  const body: Record<string, unknown> = { kind };
  const title = text(input.titre, 300);
  if (title) body.title = title;
  const supplier = text(input.fournisseur, 120);
  if (supplier) body.supplier = supplier;
  const confirmation = text(input.confirmation, 80);
  if (confirmation) body.confirmation_ref = confirmation;
  const start = text(input.debut, 40) || text(input.date, 40);
  if (start) body.start_at = start;
  const end = text(input.fin, 40);
  if (end) body.end_at = end;
  if (input.prix !== undefined) body.amount = input.prix;
  if (input.details && typeof input.details === "object") body.details = input.details;
  if (typeof input.inclure_transactions === "boolean") body.include_in_ledger = input.inclure_transactions;
  return body;
}

export async function ajouterCarte(input: Record<string, unknown>, deps: DeskDeps = {}) {
  const kind = kindOf(input.type);
  if (!kind) throw new McpWriteError("Type de carte inconnu.");
  const booking = await bookingOf(input, deps);
  const add = deps.addCard ?? addStaffBookingCard;
  const result = await add(db(deps.admin), booking.id, cardBody(input, kind));
  if ("error" in result) throw new McpWriteError(result.error);
  return {
    carte_id: result.item.id,
    dossier_id: booking.id,
    reference: booking.reference,
    avertissement: result.ledgerWarning,
  };
}

export async function modifierCarte(input: Record<string, unknown>, deps: DeskDeps = {}) {
  const carteId = requireUuid(input.carte_id, "Carte");
  const booking = await bookingOf(input, deps);
  const kind = input.type ? kindOf(input.type) : null;
  if (input.type && !kind) throw new McpWriteError("Type de carte inconnu.");
  const body = cardBody(input, kind || "fee");
  delete body.kind;
  const patch = deps.patchCard ?? patchStaffBookingCard;
  const result = await patch(db(deps.admin), booking.id, carteId, body);
  if ("error" in result) throw new McpWriteError(result.error);
  return { carte_id: carteId, dossier_id: booking.id, avertissement: result.ledgerWarning };
}

export async function reordonnerCartes(input: Record<string, unknown>, deps: DeskDeps = {}) {
  const booking = await bookingOf(input, deps);
  if (!Array.isArray(input.ordre) || !input.ordre.length) throw new McpWriteError("Indiquez l’ordre des cartes.");
  const order = input.ordre.map((value) => requireUuid(value, "Carte"));
  const reorder = deps.reorder ?? persistBookingCardOrder;
  try {
    await reorder(db(deps.admin), booking.id, { submittedIds: order });
  } catch (err) {
    throw new McpWriteError(err instanceof Error ? err.message : "Ordre non enregistré.");
  }
  return { dossier_id: booking.id, ordre: order };
}

export async function deposerPieceDossier(input: Record<string, unknown>, deps: DeskDeps = {}) {
  const booking = await bookingOf(input, deps);
  const name = text(input.nom_fichier, 180);
  if (!name) throw new McpWriteError("Nom de fichier requis.");
  const bytes = decodeUploadedBytes(input.contenu);
  const carteId = text(input.carte_id, 80);
  if (carteId && !UUID.test(carteId)) throw new McpWriteError("Carte invalide.");
  const attach = deps.attach ?? attachBookingDocument;
  const saved = await attach(db(deps.admin), {
    bookingId: booking.id,
    itemId: carteId || null,
    kind: text(input.type, 40) || "other",
    file: {
      name,
      type: text(input.type_mime, 120) || "application/octet-stream",
      size: bytes.length,
      bytes,
    },
  });
  if ("error" in saved) throw new McpWriteError(saved.error);
  const doc = saved.document;
  return {
    document_id: doc.id,
    dossier_id: booking.id,
    carte_id: doc.booking_item_id ?? null,
    nom: doc.file_name,
    type: doc.kind,
  };
}

export async function retirerPieceDossier(input: Record<string, unknown>, deps: DeskDeps = {}) {
  confirmed(input);
  const booking = await bookingOf(input, deps);
  const documentId = requireUuid(input.document_id, "Pièce");
  const remove = deps.removeDoc ?? removeBookingDocument;
  const result = await remove(db(deps.admin), booking.id, documentId);
  if ("error" in result) throw new McpWriteError(result.error);
  return { retiree: true, document_id: documentId, dossier_id: booking.id };
}

function journalEntity(value: unknown): JournalEntity | null {
  const raw = text(value, 40);
  if (!raw) return null;
  const map: Record<string, JournalEntity> = {
    client: "client",
    dossier: "dossier",
    finance: "finance",
    document: "document",
    message: "message",
    user: "user",
    membre: "user",
    reglage: "setting",
    setting: "setting",
    session: "session",
    carte: "card",
    card: "card",
  };
  const entity = map[raw];
  if (!entity || !(JOURNAL_ENTITIES as readonly string[]).includes(entity)) {
    throw new McpWriteError("Entité de journal inconnue.");
  }
  return entity;
}

function journalAction(value: unknown): JournalAction | null {
  const raw = text(value, 40);
  if (!raw) return null;
  if ((JOURNAL_ACTIONS as readonly string[]).includes(raw)) return raw as JournalAction;
  throw new McpWriteError("Action de journal inconnue.");
}

export async function lireJournal(input: Record<string, unknown>, deps: DeskDeps = {}) {
  const entity = journalEntity(input.entite);
  const id = text(input.id || input.client_id || input.dossier_id, 80);
  if (id && !UUID.test(id)) throw new McpWriteError("Identifiant invalide.");
  const scoped = Boolean(entity && id && (entity === "client" || entity === "dossier"));
  const denial = journalReadDenial(currentMcpAccess().staff, scoped);
  if (denial) throw new McpWriteError(denial);
  const limitRaw = Number(input.limite);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 30;
  const query: JournalQuery = { entity, id: id || null, action: journalAction(input.action), limit };
  if (deps.readJournal) return deps.readJournal(query);
  return readJournalPage(db(deps.admin), query);
}

async function readJournalPage(admin: SupabaseClient, query: JournalQuery): Promise<JournalPage> {
  let request = admin
    .from("crm_agency_journal")
    .select("seq, occurred_at, staff_id, action, entity_type, entity_id, summary, canonical, prev_hash, row_hash")
    .order("seq", { ascending: false })
    .limit(query.limit);
  if (query.entity) request = request.eq("entity_type", query.entity);
  if (query.id) request = request.eq("entity_id", query.id);
  if (query.action) request = request.eq("action", query.action);
  const { data, error } = await request;
  if (error) throw new McpWriteError("Journal illisible.");
  const rows = (data || []) as {
    seq: number;
    occurred_at: string;
    staff_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    summary: string;
    canonical: string;
    prev_hash: string | null;
    row_hash: string;
  }[];
  const ids = [...new Set(rows.map((row) => row.staff_id).filter((value): value is string => Boolean(value)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: staff } = await admin.from("crm_staff").select("id, full_name").in("id", ids);
    for (const row of (staff || []) as { id: string; full_name: string | null }[]) {
      names.set(row.id, row.full_name || "Agence");
    }
  }
  let chaine_intacte: boolean | null = null;
  if (rows.length) {
    const { journalRowsMatch } = await import("@/lib/crm/agency-journal");
    chaine_intacte = await journalRowsMatch([...rows].reverse());
  }
  return {
    lignes: rows.map((row) => ({
      seq: row.seq,
      quand: row.occurred_at,
      auteur: names.get(row.staff_id || "") || "Agence",
      action: row.action,
      entite: row.entity_type,
      entite_id: row.entity_id,
      resume: row.summary,
    })),
    chaine_intacte,
  };
}
