import { Ledger } from "@/components/admin/Ledger";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/crm/stripe";
import { formatDateFr, formatMoney, postedLedgerTotals } from "@/lib/crm/money";
import { customerFullName, visibleServiceCopy, type CrmCustomer, type CrmTransaction } from "@/lib/crm/types";

export default async function AdminTransactionsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: transactions }, { data: expenses }, { data: customers }] = await Promise.all([
    supabase
      .from("crm_transactions")
      .select("*")
      .eq("kind", "transfer")
      .eq("direction", "credit")
      .order("occurred_on", { ascending: false })
      .limit(200),
    supabase
      .from("crm_transactions")
      .select("*")
      .eq("direction", "debit")
      .eq("status", "posted")
      .order("occurred_on", { ascending: false })
      .limit(80),
    supabase.from("crm_customers").select("*").order("last_name"),
  ]);
  const stripeReady = stripeConfigured() && stripeWebhookConfigured();
  const rows = (transactions || []) as CrmTransaction[];
  const expenseRows = (expenses || []) as CrmTransaction[];
  const posted = rows.filter((row) => row.status === "posted");
  const { credits } = postedLedgerTotals(posted);
  const { debits } = postedLedgerTotals(expenseRows);
  const names = new Map(
    ((customers || []) as CrmCustomer[]).map((customer) => [customer.id, customerFullName(customer)])
  );

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Transactions"
        subtitle="Virements crédit uniquement — rapprochement Revolut ou saisie manuelle. Le nom d’un client ouvre les transactions qu’il voit dans son espace."
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="admin-af-card rounded-2xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Encaissements</p>
          <p className="mt-1 font-display text-xl font-bold text-[var(--admin-navy)]">{posted.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Total reçu</p>
          <p className="mt-1 font-display text-xl font-bold text-[var(--admin-navy)]">{formatMoney(credits)}</p>
        </div>
        <div className="admin-af-card rounded-2xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Dépenses</p>
          <p className="mt-1 font-display text-xl font-bold text-[var(--admin-navy)]">{expenseRows.length}</p>
        </div>
        <div className="rounded-2xl bg-[var(--admin-navy)] px-4 py-3 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">Total dépensé</p>
          <p className="mt-1 font-display text-xl font-bold">{formatMoney(debits)}</p>
        </div>
      </div>
      {!stripeReady ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-white/70 px-4 py-3 text-sm text-muted">
          Cartes Stripe non ouvertes. Le rapprochement Revolut et la saisie d’un virement suffisent.
        </p>
      ) : null}
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-[var(--admin-navy)]">Encaissements</h2>
          <Ledger transactions={rows} customers={(customers || []) as CrmCustomer[]} />
        </section>
        <section className="admin-af-card overflow-hidden rounded-2xl">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Dépenses des dossiers</h2>
          </div>
          <ul className="divide-y divide-border text-sm">
            {expenseRows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <span>
                  <span className="block font-medium text-[var(--admin-navy)]">{visibleServiceCopy(row.label || "")}</span>
                  <span className="text-xs text-muted">
                    {names.get(row.customer_id) || "Client"} · {formatDateFr(row.occurred_on)}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-[var(--admin-navy)]">
                  {formatMoney(Number(row.amount), row.currency)}
                </span>
              </li>
            ))}
            {!expenseRows.length ? (
              <li className="px-5 py-8 text-center text-muted">Aucune dépense postée.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
