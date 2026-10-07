"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { companyLabelForTransaction } from "@/lib/crm/billing-companies";
import { clientLedgerAdminHref } from "@/lib/crm/client-ledger";
import type { CrmBillingCompany, CrmTransaction } from "@/lib/crm/types";
import { TX_KIND_LABELS, customerFullName, isAgencyReceipt } from "@/lib/crm/types";
import type { CustomerNameRow, PickableCustomer } from "@/lib/crm/customer-search";
import { CustomerPickField } from "@/components/admin/CustomerPickField";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { StatusChip } from "@/components/crm/ui";
import { DateFrInput, MoneyInput } from "@/components/crm/fields";
import { BusyBar } from "@/components/crm/BusyBar";
import { ledgerEmptyMessage } from "@/lib/crm/launch-status";

const STATUS_LABELS: Record<CrmTransaction["status"], string> = {
  pending: "En attente",
  posted: "Comptabilisé",
  void: "Annulé",
};

export function Ledger({
  transactions,
  names,
  billingCompanies = [],
}: {
  transactions: CrmTransaction[];
  /** Seulement les clients des lignes affichées : nom, pas la fiche. */
  names: CustomerNameRow[];
  billingCompanies?: Pick<CrmBillingCompany, "id" | "customer_id" | "company_name">[];
}) {
  const router = useRouter();
  const [filterCustomer, setFilterCustomer] = useState<PickableCustomer | null>(null);
  const customerId = filterCustomer?.id || "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [saving, setSaving] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(names.map((c) => [c.id, customerFullName(c)])),
    [names]
  );

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (!isAgencyReceipt(t)) return false;
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
        body: JSON.stringify({
          ...body,
          direction: "credit",
          kind: "transfer",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Virement impossible. Réessayez.");
        return;
      }
      form.reset();
      setNotice("Virement enregistré.");
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "rounded-xl border border-border bg-white px-3 py-2.5";
  const labelClass = "flex flex-col gap-1 text-xs font-semibold text-muted";

  const spanClass = "min-w-0 sm:col-span-2 xl:col-span-3";

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <div>
        <button
          type="button"
          aria-expanded={entryOpen}
          onClick={() => setEntryOpen((open) => !open)}
          className="admin-af-btn admin-tap mb-3 w-full rounded-full px-4 text-sm lg:hidden"
        >
          {entryOpen ? "Fermer la saisie" : "Saisir un virement"}
        </button>
        <form
          onSubmit={onSubmit}
          className={`${entryOpen ? "grid" : "hidden"} admin-af-card min-w-0 gap-3 rounded-3xl p-4 sm:grid-cols-2 sm:p-5 lg:grid xl:grid-cols-3`}
        >
          <CustomerPickField
            name="customer_id"
            label="Client"
            title="Client crédité"
            selected={null}
            controlClass={`${fieldClass} w-full min-w-0`}
          />
          <label className={labelClass}>
            Montant (€)
            <MoneyInput
              name="amount"
              required
              disabled={saving}
              aria-label="Montant"
              className={`${fieldClass} w-full min-w-0`}
            />
          </label>
          <label className={`${labelClass} sm:col-span-2 xl:col-span-1`}>
            Libellé
            <input
              name="label"
              disabled={saving}
              placeholder="Ex. Acompte virement reçu"
              className={`${fieldClass} w-full min-w-0`}
            />
          </label>
          <div className={spanClass}>
            <BusyBar active={saving} label="Enregistrement…" />
          </div>
          <button
            type="submit"
            disabled={saving}
            className={`admin-af-btn admin-tap h-12 rounded-full px-4 text-sm ${spanClass}`}
          >
            {saving ? "Enregistrement…" : "Enregistrer le virement"}
          </button>
          {error ? <p className={`text-sm text-accent ${spanClass}`}>{error}</p> : null}
          {notice ? <p className={`text-sm text-muted ${spanClass}`}>{notice}</p> : null}
        </form>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 lg:flex lg:flex-row lg:items-end">
        <div className="col-span-2 min-w-0 lg:min-w-48 lg:flex-1">
          <CustomerPickField
            name="filter_customer_id"
            label="Filtrer par client"
            title="Filtrer par client"
            selected={filterCustomer}
            placeholder="Tous les clients"
            onPick={setFilterCustomer}
            onClear={() => setFilterCustomer(null)}
            controlClass="w-full min-w-0 rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
          />
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted [&>div]:min-w-0 [&>div]:w-full">
          Du
          <DateFrInput
            value={from}
            onChange={setFrom}
            aria-label="Du (jj/mm/aaaa)"
            className="w-full min-w-0 rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted [&>div]:min-w-0 [&>div]:w-full">
          Au
          <DateFrInput
            value={to}
            onChange={setTo}
            aria-label="Au (jj/mm/aaaa)"
            className="w-full min-w-0 rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
          />
        </label>
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted lg:col-auto">
          Statut
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filtrer par statut"
            className="w-full min-w-0 rounded-xl border border-border bg-white px-3 py-2.5 text-sm lg:w-auto"
          >
            <option value="all">Tous les statuts</option>
            <option value="posted">Comptabilisé</option>
            <option value="pending">En attente</option>
            <option value="void">Annulé</option>
          </select>
        </label>
        {customerId ? (
          <Link
            href={clientLedgerAdminHref(customerId)}
            className="admin-tap col-span-2 inline-flex items-center justify-center rounded-xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)] lg:col-auto"
          >
            Vue client
          </Link>
        ) : null}
      </div>

      <div className="admin-af-card overflow-hidden rounded-2xl">
        <ul className="divide-y divide-border lg:hidden">
          {filtered.map((t) => (
            <li key={t.id} className="min-w-0 space-y-1 px-3.5 py-3.5 text-sm sm:px-4 sm:py-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <Link
                  href={clientLedgerAdminHref(t.customer_id)}
                  className="min-w-0 break-words font-medium text-[var(--admin-navy)] underline-offset-2 hover:underline"
                  title="Transactions vues par ce client"
                >
                  {byId.get(t.customer_id) || "—"}
                </Link>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-[var(--admin-navy)]">
                  {formatMoney(Number(t.amount), t.currency)}
                </span>
              </div>
              <p className="break-words font-medium text-[var(--admin-navy)]">{t.label}</p>
              <p className="break-words text-xs text-muted">
                {formatDateFr(t.occurred_on)} · {TX_KIND_LABELS[t.kind]}
                {companyLabelForTransaction(t, billingCompanies)
                  ? ` · ${companyLabelForTransaction(t, billingCompanies)}`
                  : ""}
              </p>
              <StatusChip tone={t.status === "posted" ? "gold" : t.status === "void" ? "red" : "amber"}>
                {STATUS_LABELS[t.status]}
              </StatusChip>
            </li>
          ))}
          {!filtered.length ? (
            <li className="px-4 py-8 text-center text-sm text-muted">
              {ledgerEmptyMessage(transactions.length > 0)}
            </li>
          ) : null}
        </ul>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--admin-sky)]/70 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Libellé</th>
                <th className="px-5 py-3 text-right">Crédit</th>
                <th className="px-5 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => (
                <tr key={t.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDateFr(t.occurred_on)}</td>
                  <td className="px-5 py-3 font-medium text-[var(--admin-navy)]">
                    <Link
                      href={clientLedgerAdminHref(t.customer_id)}
                      className="underline-offset-2 hover:underline"
                      title="Transactions vues par ce client"
                    >
                      {byId.get(t.customer_id) || "—"}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-[var(--admin-navy)]">{t.label}</p>
                    <p className="text-xs text-muted">
                      {TX_KIND_LABELS[t.kind]}
                      {companyLabelForTransaction(t, billingCompanies)
                        ? ` · ${companyLabelForTransaction(t, billingCompanies)}`
                        : ""}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-[var(--admin-navy)]">
                    {formatMoney(Number(t.amount), t.currency)}
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
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">
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
