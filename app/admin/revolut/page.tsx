import { createClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { RevolutInbox } from "@/components/admin/RevolutInbox";
import { revolutConfigured } from "@/lib/crm/revolut";
import type { CrmCustomer, CrmRevolutTransaction } from "@/lib/crm/types";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

export default async function AdminRevolutPage() {
  const { supabase } = await requireStaffPage();
  const { data: customers } = await supabase
    .from("crm_customers")
    .select("*")
    .order("last_name");

  let rows: CrmRevolutTransaction[] = [];
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_revolut_transactions")
      .select("*")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(200);
    rows = (data || []) as CrmRevolutTransaction[];
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageEyebrow>Back-office</PageEyebrow>
      <PageTitle
        title="Rapprochement Revolut"
        subtitle="Les virements entrants restent non rapprochés jusqu’à validation manuelle. Aucun crédit client n’est automatique."
      />
      <div className="mt-6">
        <RevolutInbox
          rows={rows}
          customers={(customers || []) as CrmCustomer[]}
          configured={revolutConfigured()}
        />
      </div>
    </div>
  );
}
