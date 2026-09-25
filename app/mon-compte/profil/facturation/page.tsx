import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { isCompanyMember } from "@/lib/crm/company-role";
import { customerFullName, type CrmBillingCompany, type CrmCustomer } from "@/lib/crm/types";
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

  const { data: companyRows } = await supabase
    .from("crm_billing_companies")
    .select("*")
    .eq("customer_id", customer.id)
    .order("sort_order");
  const companies = (companyRows || []) as CrmBillingCompany[];

  let billingParent: CrmCustomer | null = null;
  if (isCompanyMember(customer) && customer.billing_parent_id) {
    const { data } = await supabase
      .from("crm_customers")
      .select("id, first_name, last_name, company_name, email")
      .eq("id", customer.billing_parent_id)
      .maybeSingle();
    billingParent = (data as CrmCustomer | null) || null;
  }

  return (
    <div className="space-y-4 pb-6">
      <ProfileSubnav />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Société</p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Facturation</h1>
      </div>
      {isCompanyMember(customer) ? (
        <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">
            Collaborateur rattaché
          </p>
          <p className="mt-2 text-sm text-[var(--admin-navy)]">
            Vos voyages sont facturés à{" "}
            <strong>
              {billingParent?.company_name ||
                (billingParent ? customerFullName(billingParent) : "votre société")}
            </strong>
            . Vous voyez uniquement les frais liés à vos dossiers — pas les versements ni le crédit
            disponible de la société.
          </p>
          <p className="mt-3 text-xs text-muted">
            Pour modifier la facturation société, contactez l’agence ou l’admin société.
          </p>
        </section>
      ) : (
        <BillingForm customer={customer} companies={companies} />
      )}
    </div>
  );
}
