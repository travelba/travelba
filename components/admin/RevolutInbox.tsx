"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer, CrmRevolutTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";

export function RevolutInbox({
  rows,
  customers,
  configured,
}: {
  rows: CrmRevolutTransaction[];
  customers: CrmCustomer[];
  configured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function request(key: string, success: string, action: () => Promise<string | void>) {
    setPending(key);
    setMessage(null);
    try {
      const detail = await action();
      setMessage({ error: false, text: detail || success });
      router.refresh();
    } catch (error) {
      setMessage({
        error: true,
        text: error instanceof Error ? error.message : "Une erreur est survenue.",
      });
    } finally {
      setPending(null);
    }
  }

  async function post(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Erreur serveur (${response.status})`);
    return data;
  }

  async function sync() {
    await request("sync", "Synchronisation terminée.", async () => {
      const data = await post("/api/admin/revolut", { action: "sync" });
      return `Synchronisé (${data.fetched || 0} lus).`;
    });
  }

  async function match(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await request(`match-${id}`, "Virement rapproché.", async () => {
      await post(`/api/admin/revolut/${id}`, { customer_id: fd.get("customer_id") });
    });
  }

  async function ignore(id: string) {
    await request(`ignore-${id}`, "Virement ignoré.", async () => {
      await post(`/api/admin/revolut/${id}`, { action: "ignore" });
    });
  }

  async function unmatch(id: string) {
    if (!window.confirm("Annuler ce rapprochement ? L’écriture comptable liée sera annulée.")) return;
    await request(`unmatch-${id}`, "Rapprochement annulé.", async () => {
      await post(`/api/admin/revolut/${id}`, { action: "unmatch" });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form action="/api/admin/revolut/oauth" method="get">
          <button
            type="submit"
            disabled={!configured}
            className="rounded-full bg-[var(--admin-sky)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Connecter Revolut
          </button>
        </form>
        <button
          type="button"
          onClick={sync}
          disabled={pending !== null || !configured}
          className="admin-af-btn rounded-full px-4 py-2 text-sm"
        >
          {pending === "sync" ? "Synchronisation…" : "Synchroniser Revolut"}
        </button>
        {!configured ? (
          <p className="text-sm text-muted">
            Renseignez REVOLUT_CLIENT_ID et REVOLUT_PRIVATE_KEY, puis connectez le compte.
          </p>
        ) : null}
      </div>
      {message ? (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-accent" : "text-emerald-700"}`}>
          {message.text}
        </p>
      ) : null}
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
                  <button disabled={pending !== null} className="admin-af-btn rounded-full px-3 py-1 text-sm disabled:opacity-50">
                    {pending === `match-${r.id}` ? "Rapprochement…" : Number(r.amount) >= 0 ? "Créditer" : "Débiter (renversement)"}
                  </button>
                  <button
                    type="button"
                    disabled={pending !== null}
                    className="text-xs font-semibold text-muted"
                    onClick={() => ignore(r.id)}
                  >
                    {pending === `ignore-${r.id}` ? "Traitement…" : "Ignorer"}
                  </button>
                </form>
              ) : r.status === "matched" ? (
                <button type="button" disabled={pending !== null} onClick={() => void unmatch(r.id)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold disabled:opacity-50">
                  {pending === `unmatch-${r.id}` ? "Annulation…" : "Annuler le rapprochement"}
                </button>
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
