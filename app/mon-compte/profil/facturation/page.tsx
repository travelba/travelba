import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { BillingForm } from "@/components/account/BillingForm";

export default async function FacturationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  return (
    <div className="space-y-4 pb-6">
      <ProfileSubnav />
      <h1 className="font-display text-xl font-semibold text-[var(--admin-navy-deep)]">Facturation</h1>
      <BillingForm customer={customer} />
    </div>
  );
}
