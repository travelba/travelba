import type { SupabaseClient } from "@supabase/supabase-js";
import { collaboratorTripOwnerIds } from "@/lib/crm/company-role";
import { twinIdsOf } from "@/lib/crm/customer-twins";
import { isUuid } from "@/lib/crm/ids";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmCustomer } from "@/lib/crm/types";

type PeerCustomer = Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">;

/** Collaborateurs rattachés à cet admin. Un autre admin n’entre pas. */
export async function loadCollaboratorTripOwnerIds(
  supabase: SupabaseClient,
  customer: PeerCustomer
) {
  if (customer.company_role !== "admin" || !isUuid(customer.id)) return [customer.id];
  const { data } = await supabase
    .from("crm_customers")
    .select("id, company_role, billing_parent_id")
    .eq("billing_parent_id", customer.id)
    .eq("company_role", "member");
  return collaboratorTripOwnerIds(customer, (data || []) as PeerCustomer[]);
}

/** Titulaires dont l’espace lit les dossiers : soi, collaborateurs, jumeaux. */
export function mergeTripOwnerIds(base: string[], twins: string[]) {
  return [...new Set([...base, ...twins].filter(Boolean))];
}

/** Espace client : service role pour les collaborateurs et les jumeaux, repli sur soi. */
export async function clientTripOwnerIds(customer: PeerCustomer) {
  try {
    const admin = createServiceClient();
    const base =
      customer.company_role === "admin" ? await loadCollaboratorTripOwnerIds(admin, customer) : [customer.id];
    const twins = await twinIdsOf(admin, customer.id);
    return mergeTripOwnerIds(base, twins);
  } catch {
    return [customer.id];
  }
}

/** Jumeaux directs. Vide si la table n’est pas encore en place. */
export async function clientTwinIds(customerId: string) {
  try {
    return await twinIdsOf(createServiceClient(), customerId);
  } catch {
    return [] as string[];
  }
}
