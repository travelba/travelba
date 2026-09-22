import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { CompanionsManager } from "@/components/account/CompanionsManager";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import type { CrmCompanion, CrmTravelDocument } from "@/lib/crm/types";

export default async function CompanionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");
  const [{ data }, { data: documents }] = await Promise.all([
    supabase
      .from("crm_travel_companions")
      .select("*")
      .eq("customer_id", customer.id)
      .order("last_name"),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
  ]);

  return (
    <div className="space-y-4 pb-6">
      <ProfileSubnav />
      <h1 className="font-display text-xl font-semibold text-[var(--admin-navy-deep)]">Voyageurs</h1>
      <CompanionsManager
        companions={(data || []) as CrmCompanion[]}
        documents={(documents || []) as CrmTravelDocument[]}
      />
    </div>
  );
}
