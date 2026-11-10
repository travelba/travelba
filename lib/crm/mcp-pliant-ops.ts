import { McpWriteError } from "@/lib/crm/mcp-write";
import { parseEurosToCents } from "@/lib/crm/hotel-arrival";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PliantCardSnapshot = {
  dossier_id: string;
  reference: string | null;
  carte_id: string;
  pliant_card_id: string;
  libelle: string | null;
  fin: string | null;
  statut: string | null;
  plafond_euros: number | null;
  devise: string;
};

export type PliantOpsEffects = {
  load: (input: Record<string, unknown>) => Promise<PliantCardSnapshot>;
  changeLimit?: (card: PliantCardSnapshot, euros: string) => Promise<void>;
  terminate?: (card: PliantCardSnapshot) => Promise<void>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function confirmed(input: Record<string, unknown>) {
  if (input.confirmer === true) return true;
  if (input.confirmer == null || input.confirmer === false) return false;
  throw new McpWriteError("confirmer est vrai ou faux.");
}

function eurosOf(value: unknown) {
  const raw = typeof value === "number" ? String(value) : text(value);
  const cents = parseEurosToCents(raw);
  if (cents == null || cents <= 0) throw new McpWriteError("Indiquez un plafond en euros.");
  return { raw, cents };
}

function preview(action: "plafond" | "cloturer", card: PliantCardSnapshot, extra: Record<string, unknown> = {}) {
  return {
    envoye: false,
    ecrit: false,
    apercu: true,
    action,
    dossier_id: card.dossier_id,
    reference: card.reference,
    carte_id: card.carte_id,
    libelle: card.libelle,
    fin: card.fin,
    statut: card.statut,
    plafond_euros: card.plafond_euros,
    devise: card.devise,
    ...extra,
  };
}

/** Change le plafond. Sans confirmer, rien n’est envoyé à Pliant. */
export async function modifierPlafondPliant(input: Record<string, unknown>, effects: PliantOpsEffects = liveEffects()) {
  const card = await effects.load(input);
  if (card.statut === "terminated") throw new McpWriteError("Cette carte est déjà supprimée.");
  const euros = eurosOf(input.plafond);
  const body = preview("plafond", card, { plafond_nouveau: euros.raw });
  if (!confirmed(input)) return body;
  await (effects.changeLimit ?? missing("plafond"))(card, euros.raw);
  return { ...body, ecrit: true, apercu: false };
}

/** Clôture la carte. Sans confirmer, elle reste active. */
export async function cloturerCartePliant(input: Record<string, unknown>, effects: PliantOpsEffects = liveEffects()) {
  const card = await effects.load(input);
  if (card.statut === "terminated") throw new McpWriteError("Cette carte est déjà supprimée.");
  const body = preview("cloturer", card);
  if (!confirmed(input)) return body;
  await (effects.terminate ?? missing("clôture"))(card);
  return { ...body, ecrit: true, apercu: false, statut: "terminated" };
}

function missing(action: string): () => Promise<void> {
  return async () => {
    throw new McpWriteError(`La ${action} Pliant n’est pas disponible.`);
  };
}

function liveEffects(): PliantOpsEffects {
  return {
    load: (input) => loadPliantCard(input),
    changeLimit: async (card, euros) => {
      const cents = parseEurosToCents(euros);
      if (cents == null) throw new McpWriteError("Indiquez un plafond en euros.");
      const { createServiceClient } = await import("@/lib/supabase/admin");
      const { changePliantCardLimit } = await import("@/lib/crm/pliant-card-run");
      await changePliantCardLimit(createServiceClient(), card.pliant_card_id, cents, card.devise || "EUR");
    },
    terminate: async (card) => {
      const { createServiceClient } = await import("@/lib/supabase/admin");
      const { terminateBookingCard } = await import("@/lib/crm/booking-cards");
      await terminateBookingCard(createServiceClient(), card.dossier_id, card.carte_id);
    },
  };
}

export async function loadPliantCard(input: Record<string, unknown>): Promise<PliantCardSnapshot> {
  const dossierId = text(input.dossier_id);
  const reference = text(input.reference);
  if (dossierId && !UUID.test(dossierId)) throw new McpWriteError("Dossier invalide.");
  if (!dossierId && !reference) throw new McpWriteError("Indiquez le dossier.");
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const admin = createServiceClient();
  let query = admin.from("crm_bookings").select("id, reference");
  query = dossierId ? query.eq("id", dossierId) : query.eq("reference", reference);
  const { data, error } = await query.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const bookings = (data || []) as { id: string; reference: string | null }[];
  if (!bookings.length) throw new McpWriteError("Dossier introuvable.");
  if (bookings.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  const booking = bookings[0];
  const cards = await admin
    .from("crm_booking_cards")
    .select("id, pliant_card_id, label, status, limit_cents, currency, last4")
    .eq("booking_id", booking.id);
  if (cards.error) throw new McpWriteError("Carte introuvable.");
  const rows = (cards.data || []) as {
    id: string;
    pliant_card_id: string;
    label: string | null;
    status: string | null;
    limit_cents: number | null;
    currency: string | null;
    last4: string | null;
  }[];
  const carteId = text(input.carte_id);
  let chosen = rows;
  if (carteId) {
    chosen = rows.filter((row) => row.id === carteId || row.pliant_card_id === carteId);
  }
  if (!chosen.length) throw new McpWriteError("Carte introuvable.");
  if (chosen.length > 1) {
    const names = chosen.map((row) => row.label || row.last4 || "carte").join(", ");
    throw new McpWriteError(`Plusieurs cartes : ${names}. Indiquez carte_id.`);
  }
  const row = chosen[0];
  return {
    dossier_id: booking.id,
    reference: booking.reference,
    carte_id: row.id,
    pliant_card_id: row.pliant_card_id,
    libelle: row.label,
    fin: row.last4,
    statut: row.status,
    plafond_euros: row.limit_cents == null ? null : row.limit_cents / 100,
    devise: row.currency || "EUR",
  };
}
