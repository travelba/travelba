import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { EmailIngestInbox } from "@/components/admin/EmailIngestInbox";
import { GmailDiagnostic } from "@/components/admin/GmailDiagnostic";
import { requireStaffPage } from "@/lib/crm/auth";
import { backfillEmailBodies } from "@/lib/crm/email-ingest";
import { sanitizeEmailHtml } from "@/lib/crm/email-source";
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

  const inbox = (await backfillEmailBodies((rows || []) as CrmEmailIngest[])).map((row) => ({
    ...row,
    body_html: sanitizeEmailHtml(row.body_html),
  }));

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="E-mails à rattacher"
        subtitle="Mails fournisseurs analysés automatiquement — rattachez chaque réservation à un client ou à un voyage. Le carnet reste invisible tant qu’il n’est pas publié."
      />
      <div className="mt-6">
        <GmailDiagnostic />
        <EmailIngestInbox
          rows={inbox}
          customers={(customers || []) as PickableCustomer[]}
        />
      </div>
    </div>
  );
}
