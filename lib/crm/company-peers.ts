import type { SupabaseClient } from "@supabase/supabase-js";
import { adminTripOwnerIds } from "@/lib/crm/company-role";
import { isUuid } from "@/lib/crm/ids";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmCustomer } from "@/lib/crm/types";

type PeerCustomer = Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">;

/** Admins du même wallet. Le client passé doit pouvoir lire ces fiches. */
export async function loadAdminTripOwnerIds(supabase: SupabaseClient, customer: PeerCustomer) {
  const wallet = customer.company_role === "admin" ? customer.billing_parent_id || customer.id : null;
  if (!wallet || !isUuid(wallet)) return [customer.id];
  const { data } = await supabase
    .from("crm_customers")
    .select("id, company_role, billing_parent_id")
    .or(`id.eq.${wallet},billing_parent_id.eq.${wallet}`);
  return adminTripOwnerIds(customer, (data || []) as PeerCustomer[]);
}

/** Espace client : service role pour lister les admins associés, repli sur soi. */
export async function clientTripOwnerIds(customer: PeerCustomer) {
  if (customer.company_role !== "admin") return [customer.id];
  try {
    return await loadAdminTripOwnerIds(createServiceClient(), customer);
  } catch {
    return [customer.id];
  }
}
