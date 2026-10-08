import type { SupabaseClient } from "@supabase/supabase-js";
import { collaboratorTripOwnerIds } from "@/lib/crm/company-role";
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

/** Espace client : service role pour lister les collaborateurs, repli sur soi. */
export async function clientTripOwnerIds(customer: PeerCustomer) {
  if (customer.company_role !== "admin") return [customer.id];
  try {
    return await loadCollaboratorTripOwnerIds(createServiceClient(), customer);
  } catch {
    return [customer.id];
  }
}
