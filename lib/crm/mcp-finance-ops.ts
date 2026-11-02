import type { SupabaseClient } from "@supabase/supabase-js";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { Mb3mError } from "@/lib/crm/mb3m";
import { mb3mActorLabel } from "@/lib/crm/mb3m-prep";
import type { Mb3mInvoiceResult } from "@/lib/crm/mb3m-invoice";
import { pushMb3mCustomer } from "@/lib/crm/mb3m-party";
import type { TripCostActor } from "@/lib/crm/pliant-link";
import { refuseRevolutInbox } from "@/lib/crm/revolut-match";
import { refuseStripeInbox } from "@/lib/crm/stripe-match";
import type { TripCost, TripCostSource } from "@/lib/crm/trip-costs";
import { TripCostError } from "@/lib/crm/trip-costs-db";
import type { CrmRevolutTransaction, CrmStripeTransaction } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIRM = "Confirmation requise : confirmer true.";

const DESTRUCTIVE = new Set(["detacher", "deplacer", "hors_voyage", "refuser"]);

type BookingHit = { id: string; reference: string };

export type FinanceDeps = {
  admin?: SupabaseClient;
  findBooking?: (target: { id: string; reference: string }) => Promise<BookingHit>;
  reissue?: (bookingId: string, actorName: string | null) => Promise<Mb3mInvoiceResult & { creditNote: string }>;
  pushCustomer?: (customerId: string) => Promise<{ updated: boolean }>;
  runCost?: (action: string, input: Record<string, unknown>, actor: TripCostActor) => Promise<unknown>;
  loadRevolut?: (id: string) => Promise<CrmRevolutTransaction | null>;
  loadStripe?: (id: string) => Promise<CrmStripeTransaction | null>;
  refuseRevolut?: typeof refuseRevolutInbox;
  refuseStripe?: typeof refuseStripeInbox;
};

function text(value: unknown, max = 80) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function requireUuid(value: unknown, label: string) {
  const id = text(value, 80);
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

function confirmed(input: Record<string, unknown>) {
  if (input.confirmer !== true) throw new McpWriteError(CONFIRM);
}

function db(admin?: SupabaseClient) {
  return admin ?? createServiceClient();
}

function actorName() {
  return mb3mActorLabel(currentMcpAccess().actor) || "mcp";
}

function costActor(): TripCostActor {
  const staff = currentMcpAccess().staff;
  if (!staff) return { staffId: null, label: "le connecteur" };
  return { staffId: staff.id, label: staff.name || "Agence" };
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

function dossierTarget(input: Record<string, unknown>) {
  const id = text(input.dossier_id, 80);
  const reference = text(input.reference, 80);
  if (id && !UUID.test(id)) throw new McpWriteError("Dossier invalide.");
  if (!id && !reference) throw new McpWriteError("Indiquez l’identifiant ou la référence du dossier.");
  return { id, reference };
}

/** Avoir puis nouvelle facture, comme le bouton quand la marge imprimée a changé. */
export async function reprendreFactureMb3m(input: Record<string, unknown>, deps: FinanceDeps = {}) {
  confirmed(input);
  const target = dossierTarget(input);
  const booking = deps.findBooking ? await deps.findBooking(target) : await findBooking(db(deps.admin), target);
  const auteur = actorName();
  const reissue =
    deps.reissue ??
    (async (bookingId: string, name: string | null) => {
      const { reissueMb3mInvoice } = await import("@/lib/crm/mb3m-invoice");
      return reissueMb3mInvoice(db(deps.admin), bookingId, name);
    });
  try {
    const result = await reissue(booking.id, auteur);
    return {
      dossier_id: booking.id,
      reference: booking.reference,
      avoir: result.creditNote,
      numero_mb3m: result.number,
      cree: result.created,
      auteur,
    };
  } catch (err) {
    if (err instanceof Mb3mError || err instanceof McpWriteError) {
      throw err instanceof McpWriteError ? err : new McpWriteError(err.message);
    }
    throw new McpWriteError("La facture MB3M n’a pas abouti.");
  }
}

/** Envoie la fiche client (et ses sociétés) dans MB3M, comme Créer dans MB3M. */
export async function creerFicheMb3m(input: Record<string, unknown>, deps: FinanceDeps = {}) {
  const id = requireUuid(input.client_id, "Client");
  const push = deps.pushCustomer ?? pushMb3mCustomer;
  try {
    const result = await push(id);
    return { client_id: id, envoyee: true, deja_connue: result.updated, auteur: actorName() };
  } catch (err) {
    if (err instanceof Mb3mError) throw new McpWriteError(err.message);
    throw new McpWriteError("La fiche MB3M n’a pas abouti.");
  }
}

function sourceOf(value: unknown): TripCostSource | null {
  return value === "pliant" || value === "revolut" ? value : null;
}

function publicCost(cost: TripCost) {
  return {
    cout_id: cost.id,
    dossier_id: cost.bookingId,
    carte_id: cost.bookingItemId,
    montant_eur: cost.amountEur,
    source: cost.source,
    fournisseur: cost.supplier,
  };
}

/**
 * Même geste que /api/admin/comptabilite : rattacher, déplacer, détacher,
 * changer de ligne, refuser une proposition, hors voyage ou remettre dans la file.
 */
export async function comptabiliteSortie(input: Record<string, unknown>, deps: FinanceDeps = {}) {
  const action = text(input.action, 40);
  const known = ["rattacher", "deplacer", "detacher", "ligne", "refuser", "hors_voyage", "remettre"];
  if (!known.includes(action)) throw new McpWriteError("Action inconnue.");
  if (DESTRUCTIVE.has(action)) confirmed(input);
  const actor = costActor();
  if (deps.runCost) {
    const result = await deps.runCost(action, input, actor);
    return result;
  }
  const admin = db(deps.admin);
  try {
    const {
      attachOutgoing,
      detachTripCost,
      moveOutgoing,
      refuseOutgoingSuggestion,
      retargetTripCost,
      setOutgoingOutsideTrip,
    } = await import("@/lib/crm/trip-costs-db");
    const { revalidateTripAccounting } = await import("@/lib/crm/trip-costs-paths");
    const refresh = (bookingId: string | null) => {
      try {
        revalidateTripAccounting(bookingId);
      } catch {
        // Hors d’une requête Next, l’écran se rafraîchit au prochain chargement.
      }
    };
    if (action === "detacher") {
      const cost = await detachTripCost(requireUuid(input.cout_id, "Coût"), admin, actor);
      refresh(cost.bookingId);
      return { action, ...publicCost(cost) };
    }
    if (action === "ligne") {
      const cost = await retargetTripCost(
        requireUuid(input.cout_id, "Coût"),
        text(input.carte_id, 80) ? requireUuid(input.carte_id, "Carte") : null,
        admin
      );
      refresh(cost.bookingId);
      return { action, ...publicCost(cost) };
    }
    const source = sourceOf(input.source);
    const sourceId = text(input.sortie_id, 80);
    if (!source || !UUID.test(sourceId)) throw new McpWriteError("Sortie inconnue.");
    if (action === "hors_voyage" || action === "remettre") {
      await setOutgoingOutsideTrip(source, sourceId, action === "hors_voyage", admin);
      refresh(null);
      return { action, source, sortie_id: sourceId };
    }
    const bookingId = requireUuid(input.dossier_id, "Dossier");
    if (action === "refuser") {
      await refuseOutgoingSuggestion({ source, sourceId, bookingId, actor }, admin);
      refresh(null);
      return { action, source, sortie_id: sourceId, dossier_id: bookingId };
    }
    const expense = input.nouvelle_depense;
    const link = {
      source,
      sourceId,
      bookingId,
      itemId: text(input.carte_id, 80) ? requireUuid(input.carte_id, "Carte") : null,
      stayOnly: input.sejour === true,
      newExpense:
        expense && typeof expense === "object"
          ? {
              title: text((expense as { titre?: unknown }).titre, 160) || null,
              amount: Number((expense as { prix?: unknown }).prix),
            }
          : null,
      eurAmount:
        input.montant_eur == null || input.montant_eur === "" ? null : Number(input.montant_eur),
      actor,
    };
    const cost = action === "deplacer" ? await moveOutgoing(link, admin) : await attachOutgoing(link, admin);
    refresh(bookingId);
    return { action, ...publicCost(cost) };
  } catch (err) {
    if (err instanceof TripCostError || err instanceof McpWriteError) {
      throw err instanceof McpWriteError ? err : new McpWriteError(err.message);
    }
    throw new McpWriteError("Opération impossible.");
  }
}

/** Refuse un encaissement Revolut ou Stripe encore dans la file. */
export async function refuserEncaissement(input: Record<string, unknown>, deps: FinanceDeps = {}) {
  confirmed(input);
  const source = text(input.source, 20);
  const id = requireUuid(input.id, "Paiement");
  const admin = db(deps.admin);
  if (source === "revolut") {
    const load =
      deps.loadRevolut ??
      (async (rowId: string) => {
        const { data } = await admin.from("crm_revolut_transactions").select("*").eq("id", rowId).maybeSingle();
        return (data as CrmRevolutTransaction | null) ?? null;
      });
    const row = await load(id);
    if (!row) throw new McpWriteError("Mouvement introuvable.");
    const refuse = deps.refuseRevolut ?? refuseRevolutInbox;
    const result = await refuse(admin, row);
    if (!result.ok) {
      throw new McpWriteError(result.error === "already_matched" ? "Déjà rapproché." : "Impossible de refuser ce mouvement.");
    }
    return { refuse: true, source, id };
  }
  if (source === "stripe") {
    const load =
      deps.loadStripe ??
      (async (rowId: string) => {
        const { data } = await admin.from("crm_stripe_transactions").select("*").eq("id", rowId).maybeSingle();
        return (data as CrmStripeTransaction | null) ?? null;
      });
    const row = await load(id);
    if (!row) throw new McpWriteError("Paiement introuvable.");
    const refuse = deps.refuseStripe ?? refuseStripeInbox;
    const result = await refuse(admin, row);
    if (!result.ok) {
      throw new McpWriteError(result.error === "already_matched" ? "Déjà rapproché." : "Impossible de refuser ce paiement.");
    }
    return { refuse: true, source, id };
  }
  throw new McpWriteError("Source inconnue.");
}
