"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { companyDisplayName, companyRoleLabel } from "@/lib/crm/company-role";
import { customerFullName, type CrmCustomer } from "@/lib/crm/types";

export function AttachBillingTravelers({
  company,
  travelers,
  allCustomers,
}: {
  company: CrmCustomer;
  travelers: CrmCustomer[];
  allCustomers: CrmCustomer[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const companyName = company.company_name || customerFullName(company);

  const attachable = useMemo(
    () =>
      allCustomers.filter(
        (c) => c.id !== company.id && c.billing_parent_id !== company.id
      ),
    [allCustomers, company.id]
  );

  async function attach(customer: { id: string }) {
    setBusyId(customer.id);
    setError(null);
    const res = await fetch(`/api/admin/clients/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billing_parent_id: company.id }),
    });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(json.error || "Rattachement impossible.");
      return;
    }
    router.refresh();
  }

  async function detach(customer: CrmCustomer) {
    setBusyId(customer.id);
    setError(null);
    const res = await fetch(`/api/admin/clients/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billing_parent_id: null,
        company_role: customer.company_role === "member" ? null : customer.company_role,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(json.error || "Retrait impossible.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="admin-af-card space-y-3 rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Voyageurs sur ce compte</h2>
          <p className="mt-1 text-sm text-muted">
            {companyName} paie leurs voyages pro. Chacun garde son carnet. Le gérant voyage aussi :
            ses dossiers débiteront ce même compte.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="admin-af-btn rounded-full px-4 py-2 text-sm"
        >
          Rattacher un voyageur
        </button>
      </div>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {travelers.length ? (
        <ul className="divide-y divide-border text-sm">
          {travelers.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link
                href={`/admin/clients/${t.id}`}
                className="text-[var(--admin-navy)] underline-offset-2 hover:underline"
              >
                {customerFullName(t)}
                {t.company_name ? ` · ${t.company_name}` : ""}
                <span className="ml-2 text-xs text-muted">
                  {companyRoleLabel(t.company_role)}
                </span>
              </Link>
              <button
                type="button"
                disabled={busyId === t.id}
                onClick={() => void detach(t)}
                className="text-xs font-semibold text-accent disabled:opacity-50"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          Personne n’est encore rattaché. Collaborateur ou gérant — tout titulaire peut voyager ici.
        </p>
      )}
      <CustomerPickDialog
        open={open}
        customers={attachable}
        title={`Rattacher à ${companyDisplayName(company)}`}
        onSelect={(c) => void attach(c)}
        onClose={() => setOpen(false)}
      />
    </section>
  );
}
