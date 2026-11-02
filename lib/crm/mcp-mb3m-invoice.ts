import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { Mb3mError, mb3mRealm, type Mb3mLine } from "@/lib/crm/mb3m";
import { emitMb3mInvoice, type Mb3mInvoiceResult } from "@/lib/crm/mb3m-invoice";
import { mb3mActorLabel, mb3mInvoiceChip, mb3mPreparationFromRow } from "@/lib/crm/mb3m-prep";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BookingHit = { id: string; reference: string };

type InvoiceRow = {
  piece_number: string | null;
  lines: Mb3mLine[] | null;
  amount: number | string | null;
  printed_at: string | null;
  attempt_status: string | null;
  attempt_error: string | null;
  attempt_started_at: string | null;
  attempt_started_by: string | null;
  updated_at: string | null;
};

export type Mb3mMcpDeps = {
  admin?: SupabaseClient;
  emit?: (bookingId: string, actorName: string | null) => Promise<Mb3mInvoiceResult>;
  findBooking?: (target: { id: string; reference: string }) => Promise<BookingHit>;
  loadInvoices?: (bookingId: string) => Promise<InvoiceRow[]>;
};

function client(admin?: SupabaseClient) {
  return admin ?? createServiceClient();
}

function dossierTarget(input: Record<string, unknown>) {
  const rawId = typeof input.dossier_id === "string" ? input.dossier_id.trim() : "";
  const reference = typeof input.reference === "string" ? input.reference.trim() : "";
  if (rawId && !UUID.test(rawId)) throw new McpWriteError("Dossier invalide.");
  if (reference.length > 80) throw new McpWriteError("Référence : 80 caractères maximum.");
  if (!rawId && !reference) throw new McpWriteError("Indiquez l’identifiant ou la référence du dossier.");
  return { id: rawId, reference };
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

async function loadInvoices(admin: SupabaseClient, bookingId: string): Promise<InvoiceRow[]> {
  const { data, error } = await admin
    .from("crm_mb3m_pieces")
    .select(
      "piece_number, lines, amount, printed_at, attempt_status, attempt_error, attempt_started_at, attempt_started_by, updated_at"
    )
    .eq("booking_id", bookingId)
    .eq("kind", "invoice")
    .eq("realm", mb3mRealm())
    .order("updated_at", { ascending: false })
    .limit(8);
  if (error) throw new McpWriteError("La facture MB3M n’a pas pu être lue.");
  return (data || []) as InvoiceRow[];
}

function publicLines(lines: Mb3mLine[] | null | undefined) {
  return (lines || []).map((line) => ({
    libelle: line.label,
    activite: line.activityId ?? null,
    net: line.netPriceTotal,
    marge: line.marginUnit ?? null,
    quantite: line.quantity,
  }));
}

function money(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function pieceView(row: InvoiceRow | null) {
  if (!row) return { numero_mb3m: null as string | null, lignes: publicLines(null), montant: null as number | null };
  return {
    numero_mb3m: (row.piece_number || "").trim() || null,
    lignes: publicLines(row.lines),
    montant: money(row.amount),
  };
}

function statutOf(result: Mb3mInvoiceResult) {
  if (result.printed && !result.created) return "imprimee";
  if (!result.created && !result.replaced) return "deja_en_place";
  if (result.replaced) return "mise_a_jour";
  return "preparee";
}

function readStatut(row: InvoiceRow | null) {
  if (!row) return { statut: "a_preparer", libelle: "À préparer", erreur: null as string | null };
  const preparation = mb3mPreparationFromRow(row);
  const chip = mb3mInvoiceChip({
    marginStale: false,
    printed: Boolean(row.printed_at),
    number: (row.piece_number || "").trim() || null,
    preparation: preparation.state,
  });
  const statut =
    chip.label === "Préparation en cours"
      ? "en_cours"
      : chip.label === "Préparation échouée"
        ? "echouee"
        : chip.label === "Imprimée"
          ? "imprimee"
          : chip.label === "Pro forma"
            ? "pro_forma"
            : "a_preparer";
  return { statut, libelle: chip.label, erreur: preparation.state === "failed" ? preparation.message : null };
}

function refresh(bookingId: string) {
  try {
    revalidatePath(`/admin/reservations/${bookingId}`);
  } catch {
    // Hors d’une requête Next, la page se rafraîchit au prochain chargement.
  }
}

/**
 * Même geste que le bouton « Préparer la facture » / « Reprendre ».
 * `emitMb3mInvoice` ne crée pas une seconde pièce quand la pro forma ouverte a déjà ces lignes,
 * ni quand la facture imprimée couvre déjà les dépenses.
 */
export async function preparerFactureMb3m(input: Record<string, unknown>, deps: Mb3mMcpDeps = {}) {
  const target = dossierTarget(input);
  const admin = deps.admin;
  const booking = deps.findBooking ? await deps.findBooking(target) : await findBooking(client(admin), target);
  const auteur = mb3mActorLabel(currentMcpAccess().actor) || "mcp";
  const emit = deps.emit ?? ((bookingId: string, actorName: string | null) => emitMb3mInvoice(client(admin), bookingId, actorName));
  const load = deps.loadInvoices ?? ((bookingId: string) => loadInvoices(client(admin), bookingId));
  try {
    const result = await emit(booking.id, auteur);
    let pieces: InvoiceRow[] = [];
    try {
      pieces = await load(booking.id);
    } catch {
      pieces = [];
    }
    const piece =
      pieces.find((row) => (row.piece_number || "").trim() === result.number) || pieces.find((row) => !row.printed_at) || pieces[0] || null;
    const view = pieceView(piece);
    const statut = statutOf(result);
    console.info(`[mb3m] mcp ${booking.reference} ${statut} ${result.number} par ${auteur}`);
    refresh(booking.id);
    return {
      dossier_id: booking.id,
      reference: booking.reference,
      statut,
      numero_mb3m: result.number,
      cree: result.created,
      remplacee: result.replaced,
      imprimee: result.printed,
      lignes: view.lignes.length ? view.lignes : publicLines(null),
      montant: view.montant,
      reglements: result.reglements || [],
      erreur: null,
      auteur,
    };
  } catch (err) {
    if (!(err instanceof Mb3mError)) {
      throw err instanceof McpWriteError ? err : new McpWriteError("La facture MB3M n’a pas abouti.");
    }
    let pieces: InvoiceRow[] = [];
    try {
      pieces = await load(booking.id);
    } catch {
      pieces = [];
    }
    const piece = pieces.find((row) => !row.printed_at) || pieces[0] || null;
    const view = pieceView(piece);
    const enCours = /Préparation en cours/.test(err.message);
    console.info(`[mb3m] mcp ${booking.reference} ${enCours ? "en_cours" : "echec"} par ${auteur}`);
    return {
      dossier_id: booking.id,
      reference: booking.reference,
      statut: enCours ? "en_cours" : "echec",
      numero_mb3m: view.numero_mb3m,
      cree: false,
      remplacee: false,
      imprimee: Boolean(piece?.printed_at),
      lignes: view.lignes,
      montant: view.montant,
      reglements: [],
      erreur: err.message,
      auteur,
    };
  }
}

/** Lecture de la pièce déjà enregistrée. N’appelle pas MB3M et n’en crée pas. */
export async function statutFactureMb3m(input: Record<string, unknown>, deps: Mb3mMcpDeps = {}) {
  const target = dossierTarget(input);
  const admin = deps.admin;
  const booking = deps.findBooking ? await deps.findBooking(target) : await findBooking(client(admin), target);
  const load = deps.loadInvoices ?? ((bookingId: string) => loadInvoices(client(admin), bookingId));
  const pieces = await load(booking.id);
  const current = pieces.find((row) => !row.printed_at) || pieces[0] || null;
  const read = readStatut(current);
  const view = pieceView(current);
  return {
    dossier_id: booking.id,
    reference: booking.reference,
    statut: read.statut,
    libelle: read.libelle,
    numero_mb3m: view.numero_mb3m,
    imprimee: Boolean(current?.printed_at),
    lignes: view.lignes,
    montant: view.montant,
    erreur: read.erreur,
    auteur: mb3mActorLabel(current?.attempt_started_by),
    pieces: pieces
      .filter((row) => (row.piece_number || "").trim())
      .map((row) => ({
        numero_mb3m: (row.piece_number || "").trim(),
        imprimee: Boolean(row.printed_at),
        montant: money(row.amount),
      })),
  };
}
