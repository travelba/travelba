import type { SupabaseClient } from "@supabase/supabase-js";
import { customerDeleteConfirmed, DELETE_COMPANION_CONFIRM_ERROR } from "@/lib/crm/delete-confirm";
import type { DbErrorLike } from "@/lib/crm/db-error";
import { personLabel } from "@/lib/crm/household";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { deleteTravelDocuments } from "@/lib/crm/travel-document-write";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RemoveFiles = (paths: string[]) => Promise<void>;

export type CompanionRemovalDeps = {
  admin?: SupabaseClient;
  /** Remplace le retrait Storage. Les tests ne touchent pas au coffre de production. */
  removeFiles?: RemoveFiles;
};

/**
 * Au plus les trois derniers caractères d’un numéro de pièce.
 * Un numéro trop court n’est pas renvoyé : ce serait le numéro entier.
 */
export function pieceNumberTail(value: unknown): string | null {
  const raw = String(value ?? "").replace(/\s+/g, "");
  if (raw.length < 4) return null;
  return raw.slice(-3);
}

function db(admin?: SupabaseClient) {
  return admin || createServiceClient();
}

function requireUuid(value: unknown, label: string) {
  const id = String(value ?? "").trim();
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

/** Pièces du compagnon, puis la ligne. Même geste que Retirer sur la fiche agence. */
export async function deleteCompanionDocuments(
  supabase: SupabaseClient,
  companionId: string,
  customerId?: string | null,
  removeFiles?: RemoveFiles
) {
  let listed = supabase.from("crm_travel_documents").select("id").eq("companion_id", companionId);
  if (customerId) listed = listed.eq("customer_id", customerId);
  const existing = await listed;
  if (existing.error) return { error: existing.error as DbErrorLike, pieces: 0, fichiers: 0 };
  const pieces = Array.isArray(existing.data) ? existing.data.length : 0;
  const filter: Record<string, string> = { companion_id: companionId };
  if (customerId) filter.customer_id = customerId;
  const docs = await deleteTravelDocuments(supabase, filter, removeFiles);
  if (docs.error) return { error: docs.error as DbErrorLike, pieces: 0, fichiers: 0 };
  return { error: null as DbErrorLike, pieces, fichiers: docs.paths.length };
}

export async function deleteCompanionRow(
  supabase: SupabaseClient,
  companionId: string,
  customerId?: string | null
) {
  let query = supabase.from("crm_travel_companions").delete().eq("id", companionId);
  if (customerId) query = query.eq("customer_id", customerId);
  const { data, error } = await query.select("id");
  if (error) return { error: error as DbErrorLike, removed: false };
  const rows = Array.isArray(data) ? data : [];
  return { error: null as DbErrorLike, removed: rows.length > 0 };
}

type Stay = { id: string; booking_id: string };
type BookingRef = { id: string; reference: string | null };

async function staysOf(admin: SupabaseClient, companionId: string) {
  const { data, error } = await admin
    .from("crm_booking_travelers")
    .select("id, booking_id")
    .eq("companion_id", companionId);
  if (error) throw new McpWriteError("Compagnon non retiré.");
  const travelers = (data || []) as Stay[];
  const bookingIds = [...new Set(travelers.map((row) => row.booking_id).filter(Boolean))];
  let bookings: BookingRef[] = [];
  if (bookingIds.length) {
    const listed = await admin.from("crm_bookings").select("id, reference").in("id", bookingIds);
    if (listed.error) throw new McpWriteError("Compagnon non retiré.");
    bookings = (listed.data || []) as BookingRef[];
  }
  return { travelers, bookings, bookingIds };
}

function stayList(bookingIds: string[], bookings: BookingRef[]) {
  return bookingIds
    .map((id) => {
      const row = bookings.find((item) => item.id === id);
      return row?.reference ? `${row.reference} (${id})` : id;
    })
    .join(", ");
}

/**
 * Une pièce d’un autre voyageur qui pointe encore ce voyageur ne doit pas
 * disparaître avec lui (la clé voyageur est en cascade). On détache seulement.
 */
async function detachOtherDocuments(admin: SupabaseClient, companionId: string, travelerIds: string[]) {
  if (!travelerIds.length) return;
  const { data, error } = await admin
    .from("crm_travel_documents")
    .select("id, companion_id")
    .in("traveler_id", travelerIds);
  if (error) throw new McpWriteError("Pièces non retirées.");
  for (const row of (data || []) as { id: string; companion_id: string | null }[]) {
    if (row.companion_id === companionId) continue;
    const update = await admin.from("crm_travel_documents").update({ traveler_id: null }).eq("id", row.id);
    if (update.error) throw new McpWriteError("Pièces non retirées.");
  }
}

async function removeTravelerRows(admin: SupabaseClient, companionId: string, travelers: Stay[]) {
  for (const stay of travelers) {
    const { error } = await admin
      .from("crm_booking_travelers")
      .delete()
      .eq("id", stay.id)
      .eq("companion_id", companionId);
    if (error) throw new McpWriteError("Voyageur non retiré du dossier.");
  }
}

/**
 * Retire l’accompagnateur et ses pièces, comme le bouton Retirer de la fiche.
 * Un compagnon encore voyageur est refusé, sauf `retirer_des_dossiers`, qui
 * retire seulement les lignes voyageur. Réservations, paiements, factures et
 * grand livre ne sont pas écrits.
 */
export async function supprimerCompagnon(input: Record<string, unknown>, deps: CompanionRemovalDeps = {}) {
  const clientId = requireUuid(input.client_id, "Client");
  const companionId = requireUuid(input.compagnon_id, "Compagnon");
  const admin = db(deps.admin);
  const { data, error } = await admin
    .from("crm_travel_companions")
    .select("id, customer_id, first_name, last_name")
    .eq("id", companionId)
    .maybeSingle();
  if (error) throw new McpWriteError("Compagnon introuvable.");
  const companion = data as {
    id: string;
    customer_id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
  if (!companion) throw new McpWriteError("Compagnon introuvable.");
  if (companion.customer_id !== clientId) throw new McpWriteError("Ce compagnon n’est pas sur cette fiche.");
  const nom = personLabel(companion.first_name, companion.last_name);
  if (!customerDeleteConfirmed(input.confirmer, nom)) throw new McpWriteError(DELETE_COMPANION_CONFIRM_ERROR);

  const stays = await staysOf(admin, companionId);
  if (stays.travelers.length && input.retirer_des_dossiers !== true) {
    const list = stayList(stays.bookingIds, stays.bookings);
    const where = stays.travelers.length > 1 ? "ces dossiers" : "ce dossier";
    throw new McpWriteError(
      `Ce compagnon est voyageur sur ${where} : ${list}. retirer_des_dossiers true le retire de ces dossiers. Les réservations, les paiements, les factures et le grand livre ne sont pas modifiés.`
    );
  }

  const docs = await deleteCompanionDocuments(admin, companionId, clientId, deps.removeFiles);
  if (docs.error) throw new McpWriteError("Pièces non retirées.");
  const dossiers = stays.bookingIds.map((id) => {
    const row = stays.bookings.find((item) => item.id === id);
    return { dossier_id: id, reference: row?.reference || null };
  });
  if (input.retirer_des_dossiers === true && stays.travelers.length) {
    await detachOtherDocuments(
      admin,
      companionId,
      stays.travelers.map((row) => row.id)
    );
    await removeTravelerRows(admin, companionId, stays.travelers);
  }
  const row = await deleteCompanionRow(admin, companionId, clientId);
  if (row.error || !row.removed) throw new McpWriteError("Compagnon non retiré.");
  return {
    supprime: true,
    client_id: clientId,
    compagnon_id: companionId,
    nom,
    pieces: docs.pieces,
    fichiers: docs.fichiers,
    dossiers,
    notifie: false,
  };
}

/** Pièce d’identité du coffre client (titulaire ou compagnon), pas une pièce de dossier. */
export async function supprimerPieceClient(input: Record<string, unknown>, deps: CompanionRemovalDeps = {}) {
  if (input.confirmer !== true) throw new McpWriteError("Confirmation requise : confirmer true.");
  const clientId = requireUuid(input.client_id, "Client");
  const documentId = requireUuid(input.document_id, "Pièce");
  const admin = db(deps.admin);
  const { data, error } = await admin
    .from("crm_travel_documents")
    .select("id, customer_id, companion_id, doc_type, number")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new McpWriteError("Pièce introuvable sur cette fiche.");
  const document = data as {
    id: string;
    customer_id: string;
    companion_id: string | null;
    doc_type: string | null;
    number: string | null;
  } | null;
  if (!document || document.customer_id !== clientId) throw new McpWriteError("Pièce introuvable sur cette fiche.");
  const fin = pieceNumberTail(document.number);
  const removed = await deleteTravelDocuments(
    admin,
    { id: documentId, customer_id: clientId },
    deps.removeFiles
  );
  if (removed.error) throw new McpWriteError("Pièce non retirée.");
  return {
    retiree: true,
    document_id: documentId,
    client_id: clientId,
    compagnon_id: document.companion_id,
    titulaire: !document.companion_id,
    type: document.doc_type,
    ...(fin ? { fin } : {}),
    notifie: false,
  };
}
