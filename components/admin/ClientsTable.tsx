"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CrmBalance, CrmCustomer } from "@/lib/crm/types";
import { customerFullName } from "@/lib/crm/types";
import { formatMoney } from "@/lib/crm/money";

export function ClientsTable({
  customers,
  balances,
}: {
  customers: CrmCustomer[];
  balances: CrmBalance[];
}) {
  const [q, setQ] = useState("");
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
      const hay = `${customerFullName(c)} ${c.email} ${c.phone || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [customers, q]);

  return (
    <div className="mt-6 space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un client (nom, email, téléphone)…"
        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--admin-navy)] focus:ring-2 focus:ring-[var(--admin-sky)]"
      />
      <ul className="admin-af-card divide-y divide-border overflow-hidden rounded-2xl">
        {filtered.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/clients/${c.id}`}
              className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-[var(--admin-sky)]/40"
            >
              <div>
                <p className="font-semibold text-[var(--admin-navy)]">{customerFullName(c)}</p>
                <p className="text-xs text-muted">
                  {c.email}
                  {c.phone ? ` · ${c.phone}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold">
                {(bal.get(c.id) || [])
                  .map((b) => formatMoney(Number(b.balance), b.currency))
                  .join(" · ") || "—"}
              </p>
            </Link>
          </li>
        ))}
        {!filtered.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">Aucun client trouvé.</li>
        ) : null}
      </ul>
    </div>
  );
}
