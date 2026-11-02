import type { SupabaseClient } from "@supabase/supabase-js";
import { currentMcpAccess } from "./mcp-auth";
import { McpWriteError } from "./mcp-write";
import { runInvoiceSend, type InvoiceRequest } from "./invoice-run";
import { statementBotId } from "./statement-dispatch";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function flag(value: unknown) {
  if (value == null) return undefined;
  if (typeof value !== "boolean") throw new McpWriteError("confirmer, email, whatsapp et force sont vrai ou faux.");
  return value;
}

async function bookingId(admin: SupabaseClient, input: Record<string, unknown>) {
  const rawId = typeof input.dossier_id === "string" ? input.dossier_id.trim() : "";
  const reference = typeof input.reference === "string" ? input.reference.trim() : "";
  if (rawId && !UUID.test(rawId)) throw new McpWriteError("Dossier invalide.");
  if (!rawId && !reference) throw new McpWriteError("Indiquez l’identifiant ou la référence du dossier.");
  let query = admin.from("crm_bookings").select("id, reference");
  query = rawId ? query.eq("id", rawId) : query.eq("reference", reference);
  const { data, error } = await query.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const rows = (data || []) as { id: string }[];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0].id;
}

/** Prépare l’envoi. `confirmer` true envoie. L’auteur est le jeton, ou le membre de la clé. */
export async function envoyerFacture(input: Record<string, unknown>, admin?: SupabaseClient) {
  const request: InvoiceRequest = {
    confirmer: flag(input.confirmer) === true,
    email: flag(input.email),
    whatsapp: flag(input.whatsapp),
    force: flag(input.force) === true,
  };
  if ("lien_stripe" in input) {
    if (input.lien_stripe != null && typeof input.lien_stripe !== "string") {
      throw new McpWriteError("Le lien Stripe est une adresse.");
    }
    request.lienStripe = typeof input.lien_stripe === "string" ? input.lien_stripe : "";
  }
  const client = admin ?? createServiceClient();
  const id = await bookingId(client, input);
  const access = currentMcpAccess();
  const name = access.staff?.name || statementBotId(access.actor);
  const result = await runInvoiceSend(client, id, request, { staffId: access.staff?.id || null, name });
  const body = result.body as { error?: string; envoye?: boolean };
  if (result.status === 404 || result.status === 409 || (result.status === 400 && body.envoye == null && body.error)) {
    throw new McpWriteError(body.error || "La facture n’a pas été envoyée.");
  }
  return { ...result.body, auteur: name };
}
