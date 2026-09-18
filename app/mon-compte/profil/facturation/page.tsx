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
    <div className="space-y-4 px-5 pb-10">
      <ProfileSubnav />
      <div>
        <h1 className="font-display text-xl font-semibold text-[var(--admin-navy-deep)]">
          Facturation
        </h1>
        <p className="mt-1 text-sm text-muted">
          Adresse et société pour vos factures. Les cartes bancaires ne sont pas gérées ici.
        </p>
      </div>
      <BillingForm customer={customer} />
    </div>
  );
}
