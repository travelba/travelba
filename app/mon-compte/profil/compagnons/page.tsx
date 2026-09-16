import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { CompanionsManager } from "@/components/account/CompanionsManager";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import type { CrmCompanion } from "@/lib/crm/types";

export default async function CompanionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");
  const { data } = await supabase
    .from("crm_travel_companions")
    .select("*")
    .eq("customer_id", customer.id)
    .order("last_name");

  return (
    <div className="space-y-4 px-5 pb-10">
      <ProfileSubnav />
      <h1 className="text-xl font-semibold text-[var(--admin-navy-deep)]">Compagnons de voyage</h1>
      <p className="text-xs text-muted">Personnes régulièrement associées à vos dossiers.</p>
      <CompanionsManager companions={(data || []) as CrmCompanion[]} />
    </div>
  );
}
