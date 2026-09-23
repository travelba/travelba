import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { EmailIngestInbox } from "@/components/admin/EmailIngestInbox";
import { requireStaffPage } from "@/lib/crm/auth";
import type { CrmCustomer, CrmEmailIngest } from "@/lib/crm/types";
import type { PickableCustomer } from "@/lib/crm/customer-search";

export default async function AdminEmailsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: rows }, { data: customers }] = await Promise.all([
    supabase
      .from("crm_email_ingest")
      .select("*")
      .in("status", ["parsed", "matched"])
      .order("received_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("crm_customers")
      .select("id, first_name, last_name, company_name, email, phone")
      .order("last_name"),
  ]);

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="E-mails à rattacher"
        subtitle="Mails fournisseurs analysés automatiquement — rattachez chaque réservation à un client ou à un voyage. Le carnet reste invisible tant qu’il n’est pas publié."
      />
      <div className="mt-6">
        <EmailIngestInbox
          rows={(rows || []) as CrmEmailIngest[]}
          customers={(customers || []) as PickableCustomer[]}
        />
      </div>
    </div>
  );
}
