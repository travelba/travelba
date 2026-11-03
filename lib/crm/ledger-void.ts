import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "@/lib/crm/audit-events";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LedgerVoidError extends Error {}

type Movement = {
  id: string;
  source: string | null;
  status: string | null;
  direction: string | null;
  amount: number | string | null;
  currency: string | null;
  label: string | null;
  customer_id: string | null;
  booking_id: string | null;
};

/** Annule un débit saisi à la main. Un crédit repart par Remettre en non rattaché. */
export async function voidManualLedgerMovement(admin: SupabaseClient, id: string, actor: string) {
  if (!UUID.test(id)) throw new LedgerVoidError("Mouvement invalide.");
  const { data, error } = await admin
    .from("crm_transactions")
    .select("id, source, status, direction, amount, currency, label, customer_id, booking_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new LedgerVoidError("Mouvement introuvable.");
  const row = data as Movement | null;
  if (!row) throw new LedgerVoidError("Mouvement introuvable.");
  if (row.source !== "manual") throw new LedgerVoidError("Seul un mouvement saisi à la main s’annule ici.");
  if (row.direction !== "debit") {
    throw new LedgerVoidError("Ce crédit se retire avec Remettre en non rattaché.");
  }
  if (row.status === "void") {
    return { annule: true as const, deja_annule: true as const, id: row.id };
  }
  const { error: updateError } = await admin.from("crm_transactions").update({ status: "void" }).eq("id", row.id);
  if (updateError) throw new LedgerVoidError("Annulation impossible.");
  const { error: auditError } = await admin.from("crm_audit_events").insert(
    toAuditRow({
      actorKind: "auto",
      action: "mouvement_annule",
      customerId: row.customer_id,
      bookingId: row.booking_id,
      summary: "Mouvement manuel annulé",
      detail: {
        mouvement_id: row.id,
        libelle: row.label,
        montant: row.amount,
        devise: row.currency,
        acteur: actor,
      },
      source: "mcp",
    })
  );
  if (auditError) console.error("[ledger] journal", auditError.code ?? "?");
  return { annule: true as const, deja_annule: false as const, id: row.id, libelle: row.label };
}
