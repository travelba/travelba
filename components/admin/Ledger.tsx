"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer, CrmTransaction } from "@/lib/crm/types";
import { TX_KIND_LABELS, customerFullName } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { StatusChip } from "@/components/crm/ui";
import { DateFrInput, MoneyInput } from "@/components/crm/fields";
import { ledgerEmptyMessage } from "@/lib/crm/launch-status";

const STATUS_LABELS: Record<CrmTransaction["status"], string> = {
  pending: "En attente",
  posted: "Comptabilisé",
  void: "Annulé",
};

export function Ledger({
  transactions,
  customers,
}: {
  transactions: CrmTransaction[];
  customers: CrmCustomer[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(customers.map((c) => [c.id, customerFullName(c)])),
    [customers]
  );

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (customerId && t.customer_id !== customerId) return false;
      if (status !== "all" && t.status !== status) return false;
      if (from && t.occurred_on < from) return false;
      if (to && t.occurred_on > to) return false;
      return true;
    });
  }, [transactions, customerId, from, to, status]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Écriture impossible. Réessayez.");
        return;
      }
      form.reset();
      setNotice("Écriture enregistrée.");
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "rounded-xl border border-border bg-white px-3 py-2.5";
  const labelClass = "flex flex-col gap-1 text-xs font-semibold text-muted";

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-3">
        <label className={labelClass}>
          Client
          <select name="customer_id" required disabled={saving} className={fieldClass}>
            <option value="">Choisir un client…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.last_name} {c.first_name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Sens
          <select name="direction" disabled={saving} className={fieldClass}>
            <option value="debit">Débit</option>
            <option value="credit">Crédit</option>
          </select>
        </label>
        <label className={labelClass}>
          Type
          <select name="kind" disabled={saving} className={fieldClass}>
            <option value="adjustment">Ajustement</option>
            <option value="booking">Réservation</option>
            <option value="transfer">Virement</option>
            <option value="refund">Remboursement</option>
          </select>
        </label>
        <label className={labelClass}>
          Montant (€)
          <MoneyInput
            name="amount"
            required
            disabled={saving}
            aria-label="Montant"
            className={fieldClass}
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Libellé
          <input
            name="label"
            disabled={saving}
            placeholder="Ex. Acompte séjour Bali"
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="admin-af-btn h-[54px] rounded-full px-4 text-sm sm:col-span-3"
        >
          {saving ? "Enregistrement…" : "Saisir une écriture"}
        </button>
        {error ? <p className="text-sm text-accent sm:col-span-3">{error}</p> : null}
        {notice ? <p className="text-sm text-muted sm:col-span-3">{notice}</p> : null}
      </form>

      <div className="flex flex-col gap-2 lg:flex-row">
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          aria-label="Filtrer par client"
          className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
        >
          <option value="">Tous les clients</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {customerFullName(c)}
            </option>
          ))}
        </select>
        <DateFrInput
          value={from}
          onChange={setFrom}
          aria-label="Du (jj/mm/aaaa)"
          className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
        />
        <DateFrInput
          value={to}
          onChange={setTo}
          aria-label="Au (jj/mm/aaaa)"
          className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrer par statut"
          className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
        >
          <option value="all">Tous les statuts</option>
          <option value="posted">Comptabilisé</option>
          <option value="pending">En attente</option>
          <option value="void">Annulé</option>
        </select>
      </div>

      <div className="admin-af-card overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--admin-sky)]/70 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Libellé</th>
                <th className="px-5 py-3 text-right">Débit</th>
                <th className="px-5 py-3 text-right">Crédit</th>
                <th className="px-5 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => (
                <tr key={t.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDateFr(t.occurred_on)}</td>
                  <td className="px-5 py-3 font-medium text-[var(--admin-navy)]">
                    {byId.get(t.customer_id) || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-[var(--admin-navy)]">{t.label}</p>
                    <p className="text-xs text-muted">{TX_KIND_LABELS[t.kind]}</p>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-[var(--admin-red)]">
                    {t.direction === "debit" ? formatMoney(Number(t.amount), t.currency) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-[var(--admin-navy)]">
                    {t.direction === "credit" ? formatMoney(Number(t.amount), t.currency) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusChip
                      tone={t.status === "posted" ? "gold" : t.status === "void" ? "red" : "amber"}
                    >
                      {STATUS_LABELS[t.status]}
                    </StatusChip>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted">
                    {ledgerEmptyMessage(transactions.length > 0)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
