import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "@/lib/crm/audit-events";
import { customerDeleteConfirmed } from "@/lib/crm/delete-confirm";
import { attachSearchFold } from "@/lib/crm/attach-search";
import { customerFullName } from "@/lib/crm/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MergeCustomersError extends Error {}

type Person = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  auth_user_id: string | null;
};

type Doc = {
  id: string;
  customer_id: string;
  doc_type: string | null;
  number: string | null;
  companion_id: string | null;
};

/** Colonnes client à recopier. Une valeur déjà sur la fiche gardée reste. */
const FILL = ["email", "phone", "company_name"] as const;

const MOVE: [string, string][] = [
  ["crm_bookings", "customer_id"],
  ["crm_bookings", "billing_customer_id"],
  ["crm_travel_companions", "customer_id"],
  ["crm_travel_documents", "customer_id"],
  ["crm_transactions", "customer_id"],
  ["crm_payment_methods", "customer_id"],
  ["crm_customer_activity", "customer_id"],
  ["crm_customer_logins", "customer_id"],
  ["crm_whatsapp_messages", "customer_id"],
  ["crm_billing_companies", "customer_id"],
  ["crm_audit_events", "customer_id"],
  ["crm_email_ingest", "suggested_customer_id"],
  ["crm_revolut_transactions", "matched_customer_id"],
  ["crm_stripe_transactions", "matched_customer_id"],
  ["crm_pliant_transactions", "matched_customer_id"],
  ["crm_pliant_transactions", "customer_id"],
  ["crm_pliant_cards", "customer_id"],
  ["crm_customers", "billing_parent_id"],
];

function numberKey(value: string | null | undefined) {
  return attachSearchFold(value || "").replace(/ /g, "");
}

/** Deux livrets du même titulaire avec des numéros différents. */
export function conflictingIdentityDocs(kept: Doc[], drop: Doc[]) {
  const clashes: string[] = [];
  for (const doc of drop) {
    if ((doc.doc_type || "") !== "passport" && (doc.doc_type || "") !== "id_card") continue;
    const number = numberKey(doc.number);
    if (!number) continue;
    const sameHolder = kept.filter(
      (row) => row.doc_type === doc.doc_type && (row.companion_id || null) === (doc.companion_id || null)
    );
    if (!sameHolder.length) continue;
    if (sameHolder.some((row) => numberKey(row.number) === number)) continue;
    clashes.push(doc.doc_type === "passport" ? "passeport" : "carte d’identité");
  }
  return [...new Set(clashes)];
}

async function loadPerson(admin: SupabaseClient, id: string) {
  const { data, error } = await admin
    .from("crm_customers")
    .select("id, first_name, last_name, email, phone, company_name, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new MergeCustomersError("Client introuvable.");
  return (data as Person | null) || null;
}

async function loadDocs(admin: SupabaseClient, customerId: string) {
  const { data, error } = await admin
    .from("crm_travel_documents")
    .select("id, customer_id, doc_type, number, companion_id")
    .eq("customer_id", customerId);
  if (error) return [] as Doc[];
  return (data || []) as Doc[];
}

/**
 * Reprend le doublon sur la fiche gardée, puis retire le doublon.
 * confirmer est le nom complet de la fiche gardée. forcer accepte deux pièces différentes.
 */
export async function mergeCustomers(
  admin: SupabaseClient,
  input: { keepId: string; dropId: string; confirmer: unknown; force?: boolean; actor?: string }
) {
  if (!UUID.test(input.keepId) || !UUID.test(input.dropId)) throw new MergeCustomersError("Client invalide.");
  if (input.keepId === input.dropId) throw new MergeCustomersError("Choisissez deux fiches différentes.");
  const [keep, drop] = await Promise.all([loadPerson(admin, input.keepId), loadPerson(admin, input.dropId)]);
  if (!keep || !drop) throw new MergeCustomersError("Client introuvable.");
  const keptName = customerFullName({ first_name: keep.first_name || "", last_name: keep.last_name || "" });
  if (!customerDeleteConfirmed(input.confirmer, keptName)) {
    throw new MergeCustomersError("Saisissez le nom complet du client conservé.");
  }
  if (keep.auth_user_id && drop.auth_user_id && keep.auth_user_id !== drop.auth_user_id && !input.force) {
    throw new MergeCustomersError("Les deux fiches ont un accès. Confirmez avec forcer.");
  }
  const [keptDocs, dropDocs] = await Promise.all([loadDocs(admin, keep.id), loadDocs(admin, drop.id)]);
  const clashes = conflictingIdentityDocs(keptDocs, dropDocs);
  if (clashes.length && !input.force) {
    throw new MergeCustomersError(`Pièces différentes (${clashes.join(", ")}). Confirmez avec forcer.`);
  }
  const patch: Record<string, string> = {};
  for (const key of FILL) {
    if (!(keep[key] || "").trim() && (drop[key] || "").trim()) patch[key] = (drop[key] || "").trim();
  }
  if (!keep.auth_user_id && drop.auth_user_id) {
    const { error: clearError } = await admin.from("crm_customers").update({ auth_user_id: null }).eq("id", drop.id);
    if (clearError) throw new MergeCustomersError("L’accès du doublon n’a pas pu être repris.");
    patch.auth_user_id = drop.auth_user_id;
  }
  if (Object.keys(patch).length) {
    const { error } = await admin.from("crm_customers").update(patch).eq("id", keep.id);
    if (error) throw new MergeCustomersError("La fiche conservée n’a pas pu être complétée.");
  }
  for (const [table, column] of MOVE) {
    const { error } = await admin.from(table).update({ [column]: keep.id }).eq(column, drop.id);
    if (error && error.code !== "42P01" && error.code !== "42703" && error.code !== "PGRST204" && error.code !== "PGRST205") {
      throw new MergeCustomersError("Une donnée du doublon n’a pas pu être déplacée.");
    }
  }
  const { error: deleteError } = await admin.from("crm_customers").delete().eq("id", drop.id);
  if (deleteError) throw new MergeCustomersError("Le doublon n’a pas pu être retiré. Les dossiers sont déjà sur la fiche conservée.");
  const { error: auditError } = await admin.from("crm_audit_events").insert(
    toAuditRow({
      actorKind: "auto",
      action: "clients_fusionnes",
      customerId: keep.id,
      summary: "Fiches client fusionnées",
      detail: {
        garde: keep.id,
        doublon: drop.id,
        nom_doublon: customerFullName({ first_name: drop.first_name || "", last_name: drop.last_name || "" }),
        force: Boolean(input.force),
        acteur: input.actor || null,
      },
      source: "mcp",
    })
  );
  if (auditError) console.error("[merge] journal", auditError.code ?? "?");
  return {
    fusionne: true as const,
    client_id: keep.id,
    nom: keptName,
    doublon_id: drop.id,
  };
}
