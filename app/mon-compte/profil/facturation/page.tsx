import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { companyDisplayName, hasBillingParent, isCompanyWallet } from "@/lib/crm/company-role";
import { customerFullName, type CrmCustomer } from "@/lib/crm/types";
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

  let billingParent: CrmCustomer | null = null;
  if (hasBillingParent(customer) && customer.billing_parent_id) {
    const { data } = await supabase
      .from("crm_customers")
      .select("id, first_name, last_name, company_name, email")
      .eq("id", customer.billing_parent_id)
      .maybeSingle();
    billingParent = (data as CrmCustomer | null) || null;
  }
  const companyName =
    companyDisplayName(billingParent) !== "la société"
      ? companyDisplayName(billingParent)
      : billingParent
        ? customerFullName(billingParent)
        : "votre société";

  return (
    <div className="space-y-4 pb-6">
      <ProfileSubnav />
      <h1 className="font-display text-xl font-semibold text-[var(--admin-navy-deep)]">Facturation</h1>
      {hasBillingParent(customer) ? (
        <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">
            Voyages professionnels
          </p>
          <p className="mt-2 text-sm text-[var(--admin-navy)]">
            Les dossiers réglés par <strong>{companyName}</strong> apparaissent comme frais de
            voyage — pas le crédit disponible ni les versements de la société.
          </p>
          <p className="mt-3 text-xs text-muted">
            Pour modifier la facturation société, contactez l’agence ou l’admin société.
          </p>
        </section>
      ) : isCompanyWallet(customer) ? (
        <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">
            Compte {companyDisplayName(customer)}
          </p>
          <p className="mt-2 text-sm text-[var(--admin-navy)]">
            Vous êtes le gérant : vos voyages et ceux des collaborateurs débiteront ce wallet. Ils
            ne voient pas le crédit disponible ni les versements.
          </p>
        </section>
      ) : null}
      <section className="space-y-3">
        {hasBillingParent(customer) ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">
              Vos voyages personnels
            </p>
            <p className="mt-1 text-sm text-muted">
              IBAN et adresse pour un séjour à votre charge — indépendant de {companyName}.
            </p>
          </div>
        ) : null}
        <BillingForm
          customer={customer}
          emptyLabel={
            hasBillingParent(customer)
              ? "Ajouter un IBAN pour vos voyages personnels"
              : undefined
          }
        />
      </section>
    </div>
  );
}
