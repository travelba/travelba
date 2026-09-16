import Link from "next/link";
import { NewCustomerForm } from "@/components/admin/NewCustomerForm";
import { ClientsTable } from "@/components/admin/ClientsTable";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import type { CrmBalance, CrmCustomer } from "@/lib/crm/types";

export default async function AdminClientsPage() {
  const { supabase } = await requireStaffPage("bookings");
  const [{ data: customers }, { data: balances }] = await Promise.all([
    supabase.from("crm_customers").select("*").order("last_name"),
    supabase.from("crm_customer_balances").select("*"),
  ]);

  return (
    <div>
      <PageEyebrow>Back-office</PageEyebrow>
      <PageTitle
        title="Clients"
        subtitle="Fiches clients, encours et accès à l’espace voyageur."
        actions={
          <Link
            href="/admin/clients/fusion"
            className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
          >
            Fusionner des doublons
          </Link>
        }
      />
      <div className="mt-6">
        <NewCustomerForm />
      </div>
      <ClientsTable
        customers={(customers || []) as CrmCustomer[]}
        balances={(balances || []) as CrmBalance[]}
      />
    </div>
  );
}
