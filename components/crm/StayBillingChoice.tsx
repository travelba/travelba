"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { billingCompanyTabLabel } from "@/lib/crm/billing-companies";
import { BusyBar } from "@/components/crm/BusyBar";
import { fieldControlClass } from "@/components/crm/fields";

type CompanyOption = { id: string; company_name: string | null };
type ExpenseOption = { id: string; title: string; billing_company_id: string | null };

export function StayBillingChoice({
  bookingId,
  companies,
  bookingCompanyId,
  expenses,
  endpoint,
}: {
  bookingId: string;
  companies: CompanyOption[];
  bookingCompanyId: string | null;
  expenses: ExpenseOption[];
  /** client : espace voyageur. admin : le dossier est enregistré avec le séjour. */
  endpoint: "client" | "admin";
}) {
  const router = useRouter();
  const [tripCompany, setTripCompany] = useState(bookingCompanyId || "");
  const [expenseCompany, setExpenseCompany] = useState<Record<string, string>>(() =>
    Object.fromEntries(expenses.map((expense) => [expense.id, expense.billing_company_id || ""]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (companies.length < 2) return null;

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const url =
      endpoint === "client"
        ? `/api/client/bookings/${bookingId}/billing-company`
        : `/api/admin/bookings/${bookingId}/billing-company`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Enregistrement impossible");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[#e5e3dc] bg-white p-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Facturation</p>
        <h2 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">Société du séjour</h2>
        <p className="mt-1 text-sm text-muted">
          Avec l’agence, choisissez la société qui porte ce voyage ou une dépense. L’encours du compte
          reste global.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
        Ce voyage
        <select
          value={tripCompany}
          onChange={(event) => {
            const value = event.target.value;
            setTripCompany(value);
            void save({ billing_company_id: value || null });
          }}
          className={fieldControlClass}
          aria-label="Société de facturation du voyage"
        >
          <option value="">Choisir une société…</option>
          {companies.map((company, index) => (
            <option key={company.id} value={company.id}>
              {billingCompanyTabLabel(company.company_name, index, companies.length)}
            </option>
          ))}
        </select>
      </label>
      {expenses.length ? (
        <ul className="space-y-2">
          {expenses.map((expense) => (
            <li key={expense.id}>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {expense.title}
                <select
                  value={expenseCompany[expense.id] || ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setExpenseCompany((current) => ({ ...current, [expense.id]: value }));
                    void save({ item_id: expense.id, billing_company_id: value || null });
                  }}
                  className={fieldControlClass}
                  aria-label={`Société pour ${expense.title}`}
                >
                  <option value="">Même société que le voyage</option>
                  {companies.map((company, index) => (
                    <option key={company.id} value={company.id}>
                      {billingCompanyTabLabel(company.company_name, index, companies.length)}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      <BusyBar active={busy} label="Enregistrement…" />
      {saved ? <p className="text-sm text-[var(--admin-navy)]">Société enregistrée.</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </section>
  );
}
