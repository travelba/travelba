import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  TX_KIND_LABELS,
  type CrmBalance,
  type CrmTransaction,
} from "@/lib/crm/types";
import { formatDateFr, formatEncours, formatMoney } from "@/lib/crm/money";
import { EmptyState } from "@/components/crm/ui";
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

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-[var(--admin-navy)] p-5 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
          {formatEncours(balanceValue, currency)}
        </p>
        <p className="mt-2 text-xs text-white/60">Positif = avoir · négatif = reste à régler</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link
            href="/mon-compte/profil/facturation"
            className="inline-flex items-center justify-center rounded-xl bg-white/12 px-3 py-2.5 text-sm font-semibold backdrop-blur"
          >
            Facturation
          </Link>
          <a
            href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("Demande de relevé")}`}
            className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
          >
            Demander un relevé
          </a>
        </div>
      </section>

      <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">Mouvements</h2>

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((t) => {
            const credit = t.direction === "credit";
            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                    {t.label || TX_KIND_LABELS[t.kind] || t.kind}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {formatDateFr(t.occurred_on)} · {TX_KIND_LABELS[t.kind]}
                  </p>
                </div>
                <p className={`text-sm font-bold ${credit ? "text-emerald-600" : "text-[var(--admin-navy)]"}`}>
                  {credit ? "+" : "−"}
                  {formatMoney(Number(t.amount), t.currency)}
                </p>
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
