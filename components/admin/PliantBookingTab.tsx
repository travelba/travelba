"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import {
  linkedPliantTransactionIds,
  pliantExpenseTitle,
  pliantSpendCopy,
  type PliantCardRecap,
} from "@/lib/crm/pliant-booking";
import { pliantSignedCents, pliantStatusLabel } from "@/lib/crm/pliant-tx";
import type { CrmBookingItem } from "@/lib/crm/types";

function moneyCode(value: string | null | undefined) {
  const currency = (value || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
}

function amountLabel(row: PliantCardRecap["spends"][number], copy: { amount: number; currency: string } | null) {
  if (copy) return formatMoney(copy.amount, copy.currency);
  const status = (row.status || "").toUpperCase();
  if (status === "DECLINED" || status === "REVERSED") return "—";
  const signed = pliantSignedCents(row.type, row.billingCents);
  if (signed == null || signed === 0) return "—";
  return formatMoney(signed / 100, row.currency || "EUR");
}

export function PliantBookingTab({
  bookingId,
  currency,
  cards,
  items,
}: {
  bookingId: string;
  currency: string;
  cards: PliantCardRecap[];
  items: CrmBookingItem[];
}) {
  const router = useRouter();
  const bookingCurrency = moneyCode(currency);
  const [extraFiled, setExtraFiled] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filed = linkedPliantTransactionIds(items);
  for (const id of extraFiled) filed.add(id);

  async function createExpense(row: PliantCardRecap["spends"][number], amount: number) {
    if (busyId) return;
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "expense",
          title: pliantExpenseTitle(row.merchant),
          amount,
          include_in_ledger: true,
          supplier: null,
          confirmation_ref: null,
          start_at: null,
          end_at: null,
          details: { pliant_transaction_id: row.id },
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok && res.status !== 409) {
        setError(json?.error || "La dépense n’a pas pu être créée.");
        return;
      }
      setExtraFiled((current) => (current.includes(row.id) ? current : [...current, row.id]));
      router.refresh();
    } catch {
      setError("La dépense n’a pas pu être créée.");
    } finally {
      setBusyId(null);
    }
  }

  if (!cards.length) {
    return (
      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Pliant</h2>
        <p className="mt-2 text-sm text-muted">Aucune carte Pliant sur ce séjour.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
      {cards.map((card) => (
        <section key={card.pliantCardId} className="admin-af-card rounded-3xl p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">{card.label}</h2>
            {card.last4 ? (
              <p className="text-sm tabular-nums tracking-wide text-muted">···· {card.last4}</p>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            {card.ceilingCents != null
              ? `Plafond ${formatMoney(card.ceilingCents / 100, card.currency)} · `
              : null}
            Dépensé {formatMoney(card.spentCents / 100, card.currency)}
          </p>
          {card.spends.length ? (
            <ul className="mt-3 divide-y divide-[#e7e1d6]">
              {card.spends.map((row) => {
                const copy = pliantSpendCopy(row);
                const sameCurrency = copy?.currency === bookingCurrency;
                const onFile = filed.has(row.id);
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-[var(--admin-navy)]">
                        {row.merchant?.trim() || "Dépense"}
                      </span>
                      <span className="text-xs text-muted">
                        {formatDateFr(row.bookedAt)} · {pliantStatusLabel(row.status)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums text-[var(--admin-navy)]">
                        {amountLabel(row, copy)}
                      </span>
                      {copy && sameCurrency ? (
                        onFile ? (
                          <span className="text-xs font-semibold text-[var(--admin-navy)]">Au dossier</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId != null}
                            className="rounded-full bg-[#0B192C] px-3 py-1.5 text-xs font-semibold text-[#faf9f6] disabled:opacity-50"
                            onClick={() => void createExpense(row, copy.amount)}
                          >
                            {busyId === row.id ? "Création…" : "Créer la dépense"}
                          </button>
                        )
                      ) : copy ? (
                        <span className="text-xs text-muted">Autre devise</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Aucune dépense sur cette carte.</p>
          )}
        </section>
      ))}
    </div>
  );
}
