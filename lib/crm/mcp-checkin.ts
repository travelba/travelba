import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  checkinInputHasIdentity,
  checkinMcpLine,
  dossierCheckinBadge,
  parseOnlineCheckinStatus,
} from "./online-checkin";
import { checkinLinesForRead, loadCheckinContext, saveCheckinStatus } from "./online-checkin-db";
import { McpWriteError } from "./mcp-write";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function client(admin?: SupabaseClient) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function uuid(value: unknown, label: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new McpWriteError(`${label} invalide.`);
  return id;
}

async function resolveBooking(db: SupabaseClient, input: Record<string, unknown>) {
  const id = typeof input.dossier_id === "string" ? input.dossier_id.trim() : "";
  const reference = typeof input.reference === "string" ? input.reference.trim() : "";
  if (!id && !reference) throw new McpWriteError("Indiquez le dossier.");
  if (id && !UUID.test(id)) throw new McpWriteError("Dossier invalide.");
  let query = db.from("crm_bookings").select("id, reference, customer_id");
  query = id ? query.eq("id", id) : query.eq("reference", reference);
  const { data, error } = await query.limit(2);
  if (error) {
    console.error("[checkin]", error.code ?? "?");
    throw new McpWriteError("Dossier introuvable.");
  }
  const rows = (data || []) as { id: string; reference: string; customer_id: string }[];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0];
}

function payload(booking: { id: string; reference: string }, lines: ReturnType<typeof checkinLinesForRead>) {
  const badge = dossierCheckinBadge(lines);
  return {
    dossier_id: booking.id,
    reference: booking.reference,
    alerte: Boolean(badge?.alert),
    badge: badge?.label || null,
    vols: lines.map(checkinMcpLine),
  };
}

/**
 * Lecture si `statut` est absent : le bot vérifie avant de proposer un enregistrement.
 * Mise à jour si `statut` et `carte_id` sont là. L’auteur est le bot.
 */
export async function enregistrementEnLigne(input: Record<string, unknown>, admin?: SupabaseClient) {
  if (checkinInputHasIdentity(input)) {
    throw new McpWriteError("L’enregistrement en ligne ne prend pas de pièce d’identité.");
  }
  const db = client(admin);
  const booking = await resolveBooking(db, input);
  const requested = parseOnlineCheckinStatus(input.statut);
  if (input.statut != null && input.statut !== "" && !requested) {
    throw new McpWriteError("Statut inconnu. à faire, ouvert, en cours, fait, cartes reçues ou envoyées au client.");
  }
  if (requested) {
    const itemId = uuid(input.carte_id, "Carte");
    const saved = await saveCheckinStatus(db, {
      bookingId: booking.id,
      itemId,
      requested,
      actor: "bot",
    });
    if (!saved.ok) throw new McpWriteError(saved.error);
    return payload(booking, saved.lines);
  }
  const context = await loadCheckinContext(db, booking.id);
  return payload(booking, checkinLinesForRead(context));
}
