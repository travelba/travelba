"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TX_KIND_LABELS, type CrmTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";

export function TxHistory({ rows }: { rows: CrmTransaction[] }) {
  const searchParams = useSearchParams();
  const flux = searchParams.get("flux") || "all";
  const filtered = rows.filter((t) => {
    if (flux === "debit") return t.direction === "debit";
    if (flux === "credit") return t.direction === "credit";
    return true;
  });

  const tab = (id: string, label: string) => {
    const href = id === "all" ? "/mon-compte/transactions" : `/mon-compte/transactions?flux=${id}`;
    const active = flux === id;
    return (
      <Link
        href={href}
        className={`flex-1 rounded-full py-1.5 text-center font-label text-[13px] font-semibold ${
          active ? "bg-white text-[var(--admin-navy)] shadow-sm" : "text-muted"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-xl font-semibold text-[var(--admin-navy-deep)]">Historique des flux</h2>
          <span className="text-xs text-muted">Relevé de votre compte voyageur</span>
        </div>
      </div>
      <div className="flex gap-1 rounded-full bg-[#efebe0] p-1">
        {tab("all", "Toutes")}
        {tab("debit", "Débits")}
        {tab("credit", "Crédits")}
      </div>
      <div className="flex flex-col gap-2">
        {filtered.map((t) => {
          const credit = t.direction === "credit";
          return (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    credit ? "text-[var(--admin-gold)]" : "text-[var(--admin-red)]"
                  } bg-[#efebe0]`}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {credit ? "add" : t.kind === "booking" ? "hotel" : "payments"}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-[var(--admin-navy-deep)]">
                    {t.label}
                  </span>
                  <div className="flex items-center gap-1 text-muted">
                    <span className="text-xs">{formatDateFr(t.occurred_on)}</span>
                    <span className="text-[#c4c6cd]">•</span>
                    <span className="font-label text-[11px]">{TX_KIND_LABELS[t.kind]}</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end pl-2">
                <span
                  className={`text-xl font-semibold ${
                    credit ? "text-[var(--admin-navy-deep)]" : "text-[var(--admin-red)]"
                  }`}
                >
                  {credit ? "+" : "−"}
                  {formatMoney(Number(t.amount), t.currency)}
                </span>
                <span className="font-label text-[10px] font-bold uppercase text-muted">
                  {t.source === "revolut" ? "Revolut" : credit ? "Crédit" : "Débit"}
                </span>
              </div>
            </div>
          );
        })}
        {!filtered.length ? (
          <p className="rounded-2xl bg-white p-5 text-sm text-muted">Aucune écriture pour le moment.</p>
        ) : null}
      </div>
    </div>
  );
}
