import "server-only";

import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import { clientTripOwnerIds } from "@/lib/crm/company-peers";
import type { CrmBooking, CrmCustomer } from "@/lib/crm/types";

export type ClientStayLoad = {
  supabase: SupabaseClient;
  user: User | null;
  customer: CrmCustomer | null;
  booking: CrmBooking | null;
};

/** Même lecture pour l’onglet et la page : une requête, pas deux. */
export const loadClientStay = cache(async (reference: string): Promise<ClientStayLoad> => {
  const { supabase, user } = await getSessionUser();
  if (!user) return { supabase, user: null, customer: null, booking: null };
  const customer = await ensureCustomerForUser(user);
  if (!customer) return { supabase, user, customer: null, booking: null };
  const ownerIds = await clientTripOwnerIds(customer);
  const { data } = await supabase
    .from("crm_bookings")
    .select("*")
    .in("customer_id", ownerIds)
    .eq("reference", reference)
    .maybeSingle();
  return {
    supabase,
    user,
    customer,
    booking: (data as CrmBooking | null) || null,
  };
});
