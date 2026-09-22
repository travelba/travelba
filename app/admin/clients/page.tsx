import { NewCustomerForm } from "@/components/admin/NewCustomerForm";
import { ClientsTable } from "@/components/admin/ClientsTable";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import type { CrmBalance, CrmCustomer } from "@/lib/crm/types";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { supabase } = await requireStaffPage();
  const [{ data: customers, error: customersError }, { data: balances }] = await Promise.all([
    supabase.from("crm_customers").select("*").order("last_name"),
    supabase.from("crm_customer_balances").select("*"),
  ]);
  if (customersError) {
    console.error("[admin/clients]", customersError.code ?? "?", customersError.message ?? "");
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Clients"
        subtitle="Fiches, invitation du titulaire, encours. Sans téléphone, le client le renseigne dans Vous au premier accès."
      />
      <div className="mt-6">
        <NewCustomerForm />
      </div>
      {customersError ? (
        <p className="mt-4 rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm font-semibold text-[var(--admin-navy)]">
          Impossible de charger les fiches clients. Réessayez.
        </p>
      ) : null}
      <ClientsTable
        customers={(customers || []) as CrmCustomer[]}
        balances={(balances || []) as CrmBalance[]}
        initialQuery={q || ""}
      />
    </div>
  );
}
