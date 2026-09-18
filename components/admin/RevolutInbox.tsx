"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer, CrmRevolutTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";

export function RevolutInbox({
  rows,
  customers,
  configured,
  connected,
}: {
  rows: CrmRevolutTransaction[];
  customers: CrmCustomer[];
  configured: boolean;
  connected: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    const res = await fetch("/api/admin/revolut", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    });
    const json = await res.json();
    setBusy(false);
    setMessage(res.ok ? `Synchronisé (${json.fetched || 0} lus)` : json.error);
    router.refresh();
  }

  async function match(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await fetch(`/api/admin/revolut/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: fd.get("customer_id") }),
    });
    router.refresh();
  }

  async function ignore(id: string) {
    await fetch(`/api/admin/revolut/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ignore" }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/admin/revolut/oauth"
          className="rounded-full bg-[var(--admin-sky)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Connecter Revolut
        </a>
        <button
          type="button"
          onClick={sync}
          disabled={busy || !configured || !connected}
          className="admin-af-btn rounded-full px-4 py-2 text-sm"
        >
          {busy ? "Sync…" : "Synchroniser Revolut"}
        </button>
        {!configured ? (
          <p className="text-sm text-muted">
            Renseignez REVOLUT_CLIENT_ID et REVOLUT_PRIVATE_KEY, puis connectez le compte.
          </p>
        ) : !connected ? (
          <p className="text-sm text-muted">
            Clés présentes — cliquez sur Connecter Revolut (une fois, compte Business).
          </p>
        ) : null}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {r.counterparty_name || "Contrepartie inconnue"} ·{" "}
                  {formatMoney(Number(r.amount), r.currency)}
                </p>
                <p className="text-xs text-muted">
                  {formatDateFr(r.booked_at)} · {r.reference || r.revolut_transaction_id} · {r.status}
                </p>
              </div>
              {r.status === "unmatched" ? (
                <form onSubmit={(e) => match(e, r.id)} className="flex flex-wrap gap-2">
                  <select name="customer_id" required className="rounded-xl border border-border px-3 py-1 text-sm">
                    <option value="">Rapprocher vers…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.last_name} {c.first_name}
                      </option>
                    ))}
                  </select>
                  <button className="admin-af-btn rounded-full px-3 py-1 text-sm">Créditer</button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted"
                    onClick={() => ignore(r.id)}
                  >
                    Ignorer
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
        {!rows.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">Aucun virement importé.</li>
        ) : null}
      </ul>
    </div>
  );
}
