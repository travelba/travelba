import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  TX_KIND_LABELS,
  type CrmBalance,
  type CrmTransaction,
} from "@/lib/crm/types";
import {
  formatDateFr,
  formatEncours,
  formatMoney,
  postedLedgerTotals,
} from "@/lib/crm/money";
import { EmptyState } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { siteConfig } from "@/lib/site";

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
  const { credits, debits, settledPct } = postedLedgerTotals(rows);
  const remaining = Math.max(0, -balanceValue);
  const creditCount = rows.filter((t) => t.direction === "credit").length;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--admin-gold)]/15 text-[#9c7c4e]">
              <Icon name="verified_user" className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">
              Grand livre
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-muted">Encours</span>
          <span className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
            {formatEncours(balanceValue, currency)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">Positif = avoir · négatif = reste à régler</p>

        {settledPct != null ? (
          <>
            <div className="my-2 h-2.5 overflow-hidden rounded-full bg-[#e9e8e5]">
              <div
                className="h-full rounded-full bg-[var(--admin-navy)]"
                style={{ width: `${settledPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[var(--admin-navy)]">
                Déjà honoré :{" "}
                <strong>{formatMoney(credits, currency)}</strong>
              </span>
              <span className="text-[10px] font-bold text-[#9c7c4e]">{settledPct}% réglé</span>
            </div>
          </>
        ) : null}

        <div className="mt-3 flex flex-col gap-1 rounded-lg border border-[var(--admin-gold)]/20 bg-[#f4f3f0] p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">
                {remaining > 0 ? "Solde restant dû" : "Avoir"}
              </p>
              <p className="font-display text-[1.625rem] font-bold tracking-tight text-[var(--admin-navy)]">
                {formatMoney(remaining > 0 ? remaining : Math.max(0, balanceValue), currency)}
              </p>
            </div>
            {debits > 0 ? (
              <div className="text-right">
                <p className="text-[10px] text-muted">Total débité</p>
                <p className="text-sm font-semibold text-[var(--admin-navy)]">
                  {formatMoney(debits, currency)}
                </p>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Link
              href="/mon-compte/profil/facturation"
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)]"
            >
              <Icon name="account_balance" className="h-[18px] w-[18px] text-[#9c7c4e]" />
              Facturation
            </Link>
            <a
              href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("Demande de relevé")}`}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[12px] font-semibold uppercase tracking-[0.06em] text-white"
            >
              Demander un relevé
            </a>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="account_balance_wallet" className="h-5 w-5 text-[var(--admin-navy)]" />
          <h2 className="font-display text-xl font-semibold text-[var(--admin-navy)]">
            Mouvements
          </h2>
        </div>
        {creditCount ? (
          <span className="rounded-full bg-[var(--admin-gold)]/20 px-2.5 py-0.5 text-[12px] font-semibold text-[var(--admin-navy)]">
            {creditCount} règlement{creditCount > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((t) => {
            const credit = t.direction === "credit";
            return (
              <li
                key={t.id}
                className="flex flex-col gap-1 rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        credit
                          ? "bg-[var(--admin-gold)]/15 text-[var(--admin-navy)]"
                          : "bg-[#efeeeb] text-[var(--admin-navy)]"
                      }`}
                    >
                      <Icon
                        name={credit ? "south_west" : "receipt_long"}
                        className="h-[22px] w-[22px]"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-semibold text-[var(--admin-navy)]">
                        {t.label || TX_KIND_LABELS[t.kind] || t.kind}
                      </p>
                      <p className="text-[13px] text-muted">
                        {credit ? "Reçu le" : "Le"} {formatDateFr(t.occurred_on)}
                      </p>
                      <p className="pt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                        {TX_KIND_LABELS[t.kind]}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <p className="text-[16px] font-bold tracking-tight text-[var(--admin-navy)]">
                      {credit ? "+" : "−"}
                      {formatMoney(Number(t.amount), t.currency)}
                    </p>
                    <span
                      className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                        credit
                          ? "border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[var(--admin-navy)]"
                          : "border-[#e5e3dc] bg-[#efeeeb] text-[#44474c]"
                      }`}
                    >
                      {credit ? "Encaissé" : "Posté"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="Aucun mouvement"
          description="Les débits de réservation et crédits rapprochés apparaîtront ici."
        />
      )}
    </div>
  );
}
