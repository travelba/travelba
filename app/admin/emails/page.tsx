import Link from "next/link";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { EmailIngestInbox } from "@/components/admin/EmailIngestInbox";
import { requireStaffPage } from "@/lib/crm/auth";
import { sanitizeEmailHtml } from "@/lib/crm/email-source";
import { EMAIL_INBOX_QUEUE_STATUSES, type CrmEmailIngest } from "@/lib/crm/types";
import type { PickableCustomer } from "@/lib/crm/customer-search";
import { appliedSinceIso } from "@/lib/crm/import-metrics";
import { readProposalOps, type ProposalOp } from "@/lib/crm/import-proposal";

export const metadata = { title: "Boîte d'import" };

type Vue = "file" | "appliques" | "ignores";

function vueOf(value: string | string[] | undefined): Vue {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "appliques" || raw === "ignores") return raw;
  return "file";
}

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string | string[] }>;
}) {
  const vue = vueOf((await searchParams).vue);
  const since = appliedSinceIso();
  const { supabase } = await requireStaffPage();
  let mailQuery = supabase.from("crm_email_ingest").select("*");
  if (vue === "ignores") mailQuery = mailQuery.eq("status", "ignored");
  else if (vue === "appliques") mailQuery = mailQuery.eq("status", "attached").gte("updated_at", since);
  else mailQuery = mailQuery.in("status", [...EMAIL_INBOX_QUEUE_STATUSES]);
  const [{ data: rows }, { data: customers }] = await Promise.all([
    mailQuery.order("received_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("crm_customers")
      .select("id, first_name, last_name, company_name, email, phone")
      .order("last_name"),
  ]);

  // Le corps manquant d’un mail se complète au cron gmail-ingest, pas pendant l’affichage (A-26).
  const inbox = ((rows || []) as CrmEmailIngest[]).map((row) => ({
    ...row,
    body_html: sanitizeEmailHtml(row.body_html),
  }));
  const ids = inbox.map((row) => row.id);
  const proposals: { emailIngestId: string; ops: ProposalOp[]; conflict: boolean }[] = [];
  if (ids.length) {
    const { data: stored, error } = await supabase
      .from("crm_import_proposals")
      .select("email_ingest_id, ops, conflict, undone_at, created_at")
      .in("email_ingest_id", ids)
      .order("created_at", { ascending: false });
    if (!error && stored) {
      const seen = new Set<string>();
      for (const row of stored) {
        const emailIngestId = typeof row.email_ingest_id === "string" ? row.email_ingest_id : "";
        if (!emailIngestId || row.undone_at || seen.has(emailIngestId)) continue;
        seen.add(emailIngestId);
        proposals.push({
          emailIngestId,
          ops: readProposalOps(row.ops),
          conflict: row.conflict === true,
        });
      }
    }
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Boîte d'import"
        subtitle="Un fil, une carte. La proposition dit le client, le dossier et ce qui change. Rien n’est publié seul."
      />
      <nav className="mt-6 flex flex-wrap gap-2 text-sm font-semibold" aria-label="Vues de la boîte">
        {(
          [
            ["file", "À traiter", "/admin/emails"],
            ["appliques", "Appliqués automatiquement (24 h)", "/admin/emails?vue=appliques"],
            ["ignores", "Ignorés", "/admin/emails?vue=ignores"],
          ] as const
        ).map(([id, label, href]) => (
          <Link
            key={id}
            href={href}
            className={`rounded-full px-3 py-1.5 ${
              vue === id ? "bg-[#0B192C] text-white" : "bg-white text-[#0B192C] ring-1 ring-[#C5A880]"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <p className="mt-2 text-xs text-muted">Raccourcis : A accepter, I ignorer, E écarter le doublon.</p>
      <div className="mt-4">
        <EmailIngestInbox
          rows={inbox}
          customers={(customers || []) as PickableCustomer[]}
          mode={vue}
          proposals={proposals}
        />
      </div>
    </div>
  );
}
