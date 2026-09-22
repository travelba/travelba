import { Ledger } from "@/components/admin/Ledger";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/crm/stripe";
import { formatMoney, postedLedgerTotals } from "@/lib/crm/money";
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
  const stripeReady = stripeConfigured() && stripeWebhookConfigured();
  const rows = (transactions || []) as CrmTransaction[];
  const posted = rows.filter((row) => row.status === "posted");
  const { credits, debits, settledPct } = postedLedgerTotals(posted);

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Transactions"
        subtitle="Débits réservations, crédits Revolut et ajustements — seules les écritures comptabilisées impactent l’encours."
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="admin-af-card rounded-2xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Débits</p>
          <p className="mt-1 font-display text-xl font-bold text-[var(--admin-navy)]">
            {formatMoney(debits)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Crédits</p>
          <p className="mt-1 font-display text-xl font-bold text-[var(--admin-navy)]">
            {formatMoney(credits)}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--admin-navy)] px-4 py-3 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
            Réglé
          </p>
          <p className="mt-1 font-display text-xl font-bold">
            {settledPct != null ? `${settledPct} %` : "—"}
          </p>
        </div>
      </div>
      {!stripeReady ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-white/70 px-4 py-3 text-sm text-muted">
          Cartes Stripe non ouvertes. Le grand livre manuel et le rapprochement Revolut suffisent.
        </p>
      ) : null}
      <div className="mt-6">
        <Ledger transactions={rows} customers={(customers || []) as CrmCustomer[]} />
      </div>
    </div>
  );
}
