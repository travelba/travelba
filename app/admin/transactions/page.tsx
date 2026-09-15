import { Ledger } from "@/components/admin/Ledger";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/lib/crm/auth";
import type { CrmCustomer, CrmTransaction } from "@/lib/crm/types";

export default async function AdminTransactionsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: transactions }, { data: customers }] = await Promise.all([
    supabase
      .from("crm_transactions")
      .select("*")
      .order("occurred_on", { ascending: false })
      .limit(200),
    supabase.from("crm_customers").select("*").order("last_name"),
  ]);

  return (
    <div>
      <PageEyebrow>Back-office</PageEyebrow>
      <PageTitle
        title="Transactions"
        subtitle="Grand livre clients — débits réservations, crédits Revolut et ajustements."
      />
      <div className="mt-6">
        <Ledger
          transactions={(transactions || []) as CrmTransaction[]}
          customers={(customers || []) as CrmCustomer[]}
        />
      </div>
    </div>
  );
}
