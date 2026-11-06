import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPayFollowUp } from "@/components/admin/ClientPayFollowUp";
import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { agencyPayFollowUp } from "@/lib/crm/client-pay";
import { loadClientLedger } from "@/lib/crm/client-ledger";
import { customerFullName, type CrmCustomer } from "@/lib/crm/types";

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: "Transactions" };

export default async function AdminClientTransactionsPage({ params }: Props) {
  const { id } = await params;
  const { supabase } = await requireStaffPage();
  const { data: customer } = await supabase
    .from("crm_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!customer) notFound();
  const profile = customer as CrmCustomer;
  const view = await loadClientLedger(supabase, profile, "staff");
  const { data: payRows } = await supabase
    .from("crm_customer_activity")
    .select("summary, detail, created_at")
    .eq("customer_id", profile.id)
    .eq("action", "pay")
    .order("created_at", { ascending: false })
    .limit(1);
  const latestPay = (payRows || [])[0] as { summary?: string; detail?: string | null; created_at?: string } | undefined;
  const followUp =
    latestPay?.summary && latestPay.created_at
      ? agencyPayFollowUp({
          summary: latestPay.summary,
          detail: latestPay.detail,
          owed: view.owed,
          currency: view.currency,
          createdAt: latestPay.created_at,
        })
      : null;

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title={`Transactions de ${customerFullName(profile)}`}
        subtitle="Même lecture que l’espace client : mouvements comptabilisés, solde restant dû ou frais de voyage."
        actions={
          <Link
            href={`/admin/clients/${profile.id}`}
            className="text-sm font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
          >
            Fiche client
          </Link>
        }
      />
      <p className="mt-4 inline-flex rounded-full bg-[var(--admin-gold)]/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--admin-navy)]">
        Vue client
      </p>
      {followUp ? (
        <div className="mt-4 max-w-[480px]">
          <ClientPayFollowUp
            title={followUp.title}
            next={followUp.next}
            links={followUp.href ? [{ href: followUp.href, label: "Ouvrir À encaisser" }] : []}
          />
        </div>
      ) : null}
      <div className="mt-4 max-w-[480px]">
        <ClientTransactionsPanel
          view={view}
          statementEndpoint={`/api/admin/clients/${profile.id}/releve`}
          statementAudience="staff"
        />
      </div>
    </div>
  );
}
