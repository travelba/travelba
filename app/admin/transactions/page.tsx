import { Ledger } from "@/components/admin/Ledger";
import { TransactionsPanels } from "@/components/admin/TransactionsPanels";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { companyLabelForTransaction } from "@/lib/crm/billing-companies";
import { wireAccountChoices } from "@/lib/crm/funding-wallet";
import type { CrmBillingCompany } from "@/lib/crm/types";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/crm/stripe";
import { formatDateFr, formatMoney, postedLedgerTotals } from "@/lib/crm/money";
import { customerFullName, visibleServiceCopy, type CrmTransaction } from "@/lib/crm/types";
import { CUSTOMER_NAME_SELECT, type CustomerNameRow } from "@/lib/crm/customer-search";

export default async function AdminTransactionsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: transactions }, { data: expenses }, { data: billingCompanies }] =
    await Promise.all([
    supabase
      .from("crm_transactions")
      .select("*")
      .in("kind", ["transfer", "card_payment"])
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
    supabase.from("crm_billing_companies").select("id, customer_id, company_name, funding, sort_order"),
  ]);
  const companies = (billingCompanies || []) as Pick<
    CrmBillingCompany,
    "id" | "customer_id" | "company_name" | "funding" | "sort_order"
  >[];
  const stripeReady = stripeConfigured() && stripeWebhookConfigured();
  const rows = (transactions || []) as CrmTransaction[];
  const expenseRows = (expenses || []) as CrmTransaction[];
  // Les noms des seuls clients présents dans ces lignes : pas toute la table (A-06).
  const customerIds = [...new Set([...rows, ...expenseRows].map((row) => row.customer_id).filter(Boolean))];
  const { data: customers } = customerIds.length
    ? await supabase.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", customerIds)
    : { data: [] as CustomerNameRow[] };
  const nameRows = (customers || []) as CustomerNameRow[];
  const posted = rows.filter((row) => row.status === "posted");
  const { credits } = postedLedgerTotals(posted);
  const { debits } = postedLedgerTotals(expenseRows);
  const names = new Map(nameRows.map((customer) => [customer.id, customerFullName(customer)]));

  return (
    <div className="min-w-0">
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Transactions"
        subtitle="Virements Revolut, règlements Stripe et saisie manuelle. Le nom d’un client ouvre les transactions qu’il voit dans son espace."
      />
      <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3 xl:grid-cols-4">
        <div className="admin-af-card min-w-0 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9e7e51] sm:tracking-[0.14em]">Encaissements</p>
          <p className="mt-1 font-display text-lg font-bold leading-tight text-[var(--admin-navy)] sm:text-xl">{posted.length}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9e7e51] sm:tracking-[0.14em]">Total reçu</p>
          <p className="mt-1 break-words font-display text-lg font-bold leading-tight text-[var(--admin-navy)] sm:text-xl">{formatMoney(credits)}</p>
        </div>
        <div className="admin-af-card min-w-0 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9e7e51] sm:tracking-[0.14em]">Dépenses</p>
          <p className="mt-1 font-display text-lg font-bold leading-tight text-[var(--admin-navy)] sm:text-xl">{expenseRows.length}</p>
        </div>
        <div className="min-w-0 rounded-2xl bg-[var(--admin-navy)] px-3 py-2.5 text-white sm:px-4 sm:py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--admin-gold)] sm:tracking-[0.14em]">Total dépensé</p>
          <p className="mt-1 break-words font-display text-lg font-bold leading-tight sm:text-xl">{formatMoney(debits)}</p>
        </div>
      </div>
      {!stripeReady ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-white/70 px-4 py-3 text-sm text-muted">
          Cartes Stripe non ouvertes. Le rapprochement Revolut et la saisie d’un virement suffisent.
        </p>
      ) : null}
      <TransactionsPanels
        receipts={
          <>
            <h2 className="mb-3 hidden font-display text-lg font-bold text-[var(--admin-navy)] xl:block">
              Encaissements
            </h2>
            <Ledger
              transactions={rows}
              names={nameRows}
              billingCompanies={companies}
              accounts={wireAccountChoices(companies)}
            />
          </>
        }
        expenses={
          <section className="admin-af-card min-w-0 overflow-hidden rounded-2xl">
            <div className="border-b border-[var(--border)] px-4 py-3 xl:px-5 xl:py-4">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Dépenses des dossiers</h2>
            </div>
            <ul className="divide-y divide-border text-sm">
              {expenseRows.map((row) => (
                <li key={row.id} className="flex min-w-0 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 xl:px-5">
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-[var(--admin-navy)]">
                      {visibleServiceCopy(row.label || "")}
                    </span>
                    <span className="block break-words text-xs text-muted">
                      {names.get(row.customer_id) || "Client"} · {formatDateFr(row.occurred_on)}
                      {companyLabelForTransaction(row, companies)
                        ? ` · ${companyLabelForTransaction(row, companies)}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 self-end font-semibold tabular-nums text-[var(--admin-navy)] sm:self-start">
                    {formatMoney(Number(row.amount), row.currency)}
                  </span>
                </li>
              ))}
              {!expenseRows.length ? (
                <li className="px-4 py-8 text-center text-muted">Aucune dépense postée.</li>
              ) : null}
            </ul>
          </section>
        }
      />
    </div>
  );
}
