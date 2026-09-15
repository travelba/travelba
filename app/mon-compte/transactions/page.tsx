import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  TX_KIND_LABELS,
  type CrmBalance,
  type CrmTransaction,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import {
  ConciergeBanner,
  EmptyState,
  PageEyebrow,
  PageTitle,
} from "@/components/crm/ui";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const [{ data: txs }, { data: balances }] = await Promise.all([
    supabase
      .from("crm_transactions")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("status", "posted")
      .order("occurred_on", { ascending: false }),
    supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id),
  ]);

  const rows = (txs || []) as CrmTransaction[];
  const bal = ((balances || []) as CrmBalance[])[0];
  const balanceValue = bal ? Number(bal.balance) : 0;
  const currency = bal?.currency || "EUR";
  const totalDebit = rows
    .filter((t) => t.direction === "debit")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalCredit = rows
    .filter((t) => t.direction === "credit")
    .reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace privilège voyageur</PageEyebrow>
        <PageTitle
          title="Transactions"
          subtitle="Historique de vos engagements, acomptes et règlements."
          actions={
            <Link
              href="/mon-compte/profil/paiement"
              className="inline-flex rounded-xl bg-[var(--admin-navy)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Régler en ligne
            </Link>
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="admin-af-card rounded-2xl px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Encours
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[var(--admin-navy)]">
            {formatMoney(balanceValue, currency)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {balanceValue < 0 ? "Reste à payer" : balanceValue > 0 ? "Avoir" : "À jour"}
          </p>
        </div>
        <div className="admin-af-card rounded-2xl px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Total engagé
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[var(--admin-navy)]">
            {formatMoney(totalDebit, currency)}
          </p>
        </div>
        <div className="admin-af-card rounded-2xl px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Total réglé
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold text-emerald-700">
            +{formatMoney(totalCredit, currency)}
          </p>
        </div>
      </div>

      <section className="admin-af-card overflow-hidden rounded-2xl">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Journal des opérations
          </h2>
        </div>
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((t) => {
              const credit = t.direction === "credit";
              return (
                <li
                  key={t.id}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-[var(--admin-navy)]">{t.label}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateFr(t.occurred_on)} · {TX_KIND_LABELS[t.kind]}
                      {credit ? " · Crédit" : " · Débit"}
                    </p>
                  </div>
                  <p
                    className={`font-display text-base font-extrabold ${
                      credit ? "text-emerald-700" : "text-[var(--admin-navy)]"
                    }`}
                  >
                    {credit ? "+" : "−"}
                    {formatMoney(Number(t.amount), t.currency)}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState
              title="Aucune écriture pour le moment"
              description="Les débits de réservation et les crédits Revolut apparaîtront ici."
            />
          </div>
        )}
      </section>

      <ConciergeBanner />
    </div>
  );
}
