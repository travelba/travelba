"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer, CrmTransaction } from "@/lib/crm/types";
import { TX_KIND_LABELS } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";

export function Ledger({
  transactions,
  customers,
}: {
  transactions: CrmTransaction[];
  customers: CrmCustomer[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || `Erreur serveur (${response.status})`);
      form.reset();
      setNotice({ error: false, text: "Écriture enregistrée." });
      router.refresh();
    } catch (error) {
      setNotice({
        error: true,
        text: error instanceof Error ? error.message : "Une erreur est survenue.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-3">
        <select name="customer_id" required className="rounded-xl border border-border px-3 py-2">
          <option value="">Client…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.last_name} {c.first_name}
            </option>
          ))}
        </select>
        <select name="direction" className="rounded-xl border border-border px-3 py-2">
          <option value="debit">Débit</option>
          <option value="credit">Crédit</option>
        </select>
        <select name="kind" className="rounded-xl border border-border px-3 py-2">
          <option value="adjustment">Ajustement</option>
          <option value="booking">Réservation</option>
          <option value="transfer">Virement</option>
          <option value="refund">Remboursement</option>
        </select>
        <input name="amount" type="number" step="0.01" required placeholder="Montant" className="rounded-xl border border-border px-3 py-2" />
        <input name="label" placeholder="Libellé" className="rounded-xl border border-border px-3 py-2 sm:col-span-2" />
        <button disabled={pending} className="admin-af-btn rounded-full px-4 py-2 text-sm sm:col-span-3 disabled:opacity-50">
          {pending ? "Enregistrement…" : "Saisir une écriture"}
        </button>
        {notice ? (
          <p role={notice.error ? "alert" : "status"} className={`text-sm sm:col-span-3 ${notice.error ? "text-accent" : "text-emerald-700"}`}>
            {notice.text}
          </p>
        ) : null}
      </form>
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {transactions.map((t) => (
          <li key={t.id} className="flex justify-between px-5 py-3 text-sm">
            <div>
              <p className="font-medium">{t.label}</p>
              <p className="text-xs text-muted">
                {formatDateFr(t.occurred_on)} · {TX_KIND_LABELS[t.kind]} · {t.status}
              </p>
            </div>
            <p>
              {t.direction === "credit" ? "+" : "−"}
              {formatMoney(Number(t.amount), t.currency)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
