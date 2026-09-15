import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { ProfileForm } from "@/components/account/ProfileForm";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { ConciergeBanner, PageEyebrow, PageTitle } from "@/components/crm/ui";

export default async function ProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace privilège voyageur</PageEyebrow>
        <PageTitle
          title="Mon compte"
          subtitle="Gérez vos informations personnelles, moyens de paiement, documents et compagnons."
        />
        <ProfileSubnav />
      </div>
      <section className="admin-af-card rounded-2xl p-1 sm:p-2">
        <div className="px-4 pt-4 sm:px-5">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Informations personnelles
          </h2>
          <p className="mt-1 text-sm text-muted">Email : {customer.email}</p>
        </div>
        <ProfileForm customer={customer} />
      </section>
      <ConciergeBanner />
    </div>
  );
}
