import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { ServiceRequestsManager } from "@/components/account/ServiceRequestsManager";
import type { CrmServiceRequest } from "@/lib/crm/types";

export default async function RequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/mon-compte/demandes");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=account");
  const [{ data: requests }, { data: bookings }] = await Promise.all([
    supabase.from("crm_service_requests").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }),
    supabase.from("crm_bookings").select("id,reference,title").eq("customer_id", customer.id).neq("status", "draft").order("start_date", { ascending: false }),
  ]);
  return (
    <div className="space-y-5">
      <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--aura-blue)]">Conciergerie</p><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Mes demandes</h1></header>
      <ServiceRequestsManager customerId={customer.id} initialRequests={(requests || []) as CrmServiceRequest[]} bookings={bookings || []} />
    </div>
  );
}
