import { Ledger } from "@/components/admin/Ledger";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import type { CrmBooking, CrmCustomer, CrmTransaction } from "@/lib/crm/types";

export default async function AdminTransactionsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: transactions }, { data: customers }, { data: bookings }] = await Promise.all([
    supabase
      .from("crm_transactions")
      .select("*")
      .order("occurred_on", { ascending: false })
      .limit(200),
    supabase.from("crm_customers").select("*").order("last_name"),
    supabase.from("crm_bookings").select("id,customer_id,reference,title").order("created_at", { ascending: false }),
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
          bookings={(bookings || []) as Pick<CrmBooking, "id" | "customer_id" | "reference" | "title">[]}
        />
      </div>
    </div>
  );
}
