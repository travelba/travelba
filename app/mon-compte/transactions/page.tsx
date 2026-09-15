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
import { EmptyState, StatusChip } from "@/components/crm/ui";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
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
    supabase
      .from("crm_customer_balances")
      .select("*")
      .eq("customer_id", customer.id),
  ]);

  const rows = (txs || []) as CrmTransaction[];
  const bal = ((balances || []) as CrmBalance[])[0];
  const balanceValue = bal ? Number(bal.balance) : 0;
  const currency = bal?.currency || "EUR";

  const activeFilter = filter === "debit" || filter === "credit" ? filter : "all";
  const filtered = rows.filter((t) => {
    if (activeFilter === "debit") return t.direction === "debit";
    if (activeFilter === "credit") return t.direction === "credit";
    return true;
  });

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[1.5rem] bg-[var(--aura-navy-card)] p-5 text-white shadow-[0_16px_36px_rgba(19,27,46,0.35)]">
        <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[var(--aura-blue)]/25 blur-2xl" />
        <div className="relative flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white/75">
            Historique du compte
          </span>
          <span className="text-[11px] text-white/55">{rows.length} opérations</span>
        </div>
        <p className="relative mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
          Solde portefeuille voyage
        </p>
        <p className="relative mt-1 font-display text-[2rem] font-extrabold tracking-tight">
          {formatMoney(balanceValue, currency)}
        </p>
        <div className="relative mt-5 grid grid-cols-2 gap-2">
          <Link
            href="/mon-compte/paiements"
            className="inline-flex items-center justify-center rounded-xl bg-white/12 px-3 py-2.5 text-sm font-semibold backdrop-blur"
          >
            Régler une échéance
          </Link>
          <form
            action="/api/client/transactions/statement"
            method="get"
            className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2.5 text-center text-sm font-semibold text-[var(--admin-navy)]"
          >
            <button>Télécharger le relevé</button>
          </form>
        </div>
      </section>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">
            Historique des flux
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {rows.length} opérations
          </span>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            { key: "all", label: "Tous", href: "/mon-compte/transactions" },
            {
              key: "debit",
              label: "Débits Réservations",
              href: "/mon-compte/transactions?filter=debit",
            },
            {
              key: "credit",
              label: "Crédits",
              href: "/mon-compte/transactions?filter=credit",
            },
          ] as const
        ).map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
              activeFilter === item.key
                ? "bg-[var(--admin-navy)] text-white"
                : "bg-white text-[var(--admin-navy)] ring-1 ring-slate-200"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {filtered.length ? (
        <ul className="space-y-2">
          {filtered.map((t) => {
            const credit = t.direction === "credit";
            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      credit
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-[var(--aura-blue-soft)] text-[var(--aura-blue)]"
                    }`}
                  >
                    {credit ? "+" : "✈"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                        {t.label || TX_KIND_LABELS[t.kind] || t.kind}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {formatDateFr(t.occurred_on)} · {TX_KIND_LABELS[t.kind]}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-bold ${
                      credit ? "text-emerald-600" : "text-[var(--admin-navy)]"
                    }`}
                  >
                    {credit ? "+" : "−"}
                    {formatMoney(Number(t.amount), t.currency)}
                  </p>
                  <StatusChip tone={credit ? "green" : "sky"}>Reçu</StatusChip>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="Aucun mouvement trouvé"
          description="Les débits de réservation et les crédits confirmés apparaîtront ici."
        />
      )}

      <div className="rounded-2xl bg-[var(--aura-blue-soft)]/60 px-4 py-3 text-sm text-[var(--admin-navy)]">
        <p className="font-semibold">Historique de votre compte voyage</p>
        <p className="mt-0.5 text-xs text-[var(--admin-navy)]/70">
          Les opérations affichées correspondent aux écritures confirmées dans votre dossier.
        </p>
      </div>
    </div>
  );
}
