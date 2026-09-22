"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DeleteCustomerButton } from "@/components/admin/DeleteCustomerButton";
import type { CrmBalance, CrmCustomer } from "@/lib/crm/types";
import { customerFullName } from "@/lib/crm/types";
import { formatCreditDisponible, formatMoney } from "@/lib/crm/money";
import { formatPhoneDisplay } from "@/lib/crm/phone";
import { companyDisplayName, companyRoleLabel, isCompanyMember } from "@/lib/crm/company-role";

function initials(c: CrmCustomer) {
  return [c.first_name?.[0], c.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
}

export function ClientsTable({
  customers,
  balances,
  initialQuery = "",
}: {
  customers: CrmCustomer[];
  balances: CrmBalance[];
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const bal = useMemo(() => {
    const map = new Map<string, CrmBalance[]>();
    for (const row of balances) {
      const list = map.get(row.customer_id) || [];
      list.push(row);
      map.set(row.customer_id, list);
    }
    return map;
  }, [balances]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((c) => {
      const parent = customers.find((p) => p.id === c.billing_parent_id);
      const hay = `${customerFullName(c)} ${c.email} ${c.phone || ""} ${c.company_name || ""} ${parent ? companyDisplayName(parent) : ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [customers, q]);

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un client (nom, e-mail, téléphone)…"
          className="admin-af-input w-full text-sm"
        />
        <p className="shrink-0 font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {filtered.length} client{filtered.length > 1 ? "s" : ""}
        </p>
      </div>
      <div className="admin-af-card overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--admin-sky)]/70 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Téléphone</th>
                <th className="px-5 py-3 text-right">Crédit dispo. / encours</th>
                <th className="px-5 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const rows = bal.get(c.id) || [];
                const amount = rows[0];
                const value = amount ? Number(amount.balance) : 0;
                const parent = customers.find((p) => p.id === c.billing_parent_id);
                return (
                  <tr key={c.id} className="transition hover:bg-[var(--admin-sky)]/40">
                    <td className="px-5 py-3">
                      <Link href={`/admin/clients/${c.id}`} className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-[#f8f6f0]">
                          {initials(c)}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-semibold text-[var(--admin-navy)]">{customerFullName(c)}</span>
                          {c.company_role ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9e7e51]">
                              {companyRoleLabel(c.company_role)}
                              {isCompanyMember(c)
                                ? parent
                                  ? ` · ${companyDisplayName(parent)}`
                                  : ""
                                : c.company_name
                                  ? ` · ${c.company_name}`
                                  : ""}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{c.email}</td>
                    <td className="px-5 py-3 text-muted">{c.phone ? formatPhoneDisplay(c.phone) : "—"}</td>
                    <td
                      className={`px-5 py-3 text-right font-semibold ${
                        value < 0 ? "text-[var(--admin-red)]" : "text-[var(--admin-navy)]"
                      }`}
                    >
                      {rows.length ? (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span>
                            {value > 0
                              ? rows
                                  .map((b) =>
                                    formatCreditDisponible(Number(b.balance), b.currency)
                                  )
                                  .join(" · ")
                              : rows
                                  .map((b) => formatMoney(Number(b.balance), b.currency))
                                  .join(" · ")}
                          </span>
                          {value > 0 ? (
                            <span className="text-[10px] font-semibold text-[#9e7e51]">
                              Frais d’agence 10 % déduits
                            </span>
                          ) : null}
                          {isCompanyMember(c) ? (
                            <span className="text-[10px] font-semibold text-muted">Encours perso</span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <DeleteCustomerButton
                        compact
                        redirectTo={null}
                        customerId={c.id}
                        name={customerFullName(c)}
                      />
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">
                    {customers.length === 0
                      ? "Aucun client. Créez une fiche titulaire puis invitez — pas de client fictif."
                      : "Aucun client trouvé."}
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
