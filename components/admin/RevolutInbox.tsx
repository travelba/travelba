"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer, CrmRevolutTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { revolutInboxEmptyMessage } from "@/lib/crm/launch-status";
import { StatusChip } from "@/components/crm/ui";

export const REVOLUT_STATUS_LABELS: Record<string, string> = {
  unmatched: "À rapprocher",
  matched: "Crédité",
  ignored: "Ignoré",
};

export function revolutStatusLabel(status: string) {
  return REVOLUT_STATUS_LABELS[status] ?? status;
}

function revolutStatusTone(status: string): "amber" | "gold" | "navy" {
  if (status === "unmatched") return "amber";
  if (status === "matched") return "gold";
  return "navy";
}

export function RevolutInbox({
  rows,
  customers,
  configured,
  connected,
  initialMessage = null,
}: {
  rows: CrmRevolutTransaction[];
  customers: CrmCustomer[];
  configured: boolean;
  connected: boolean;
  initialMessage?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [error, setError] = useState<string | null>(null);

  function connect() {
    // Redirection OAuth Revolut : sortie du site, pas une navigation client.
    window.location.assign("/api/admin/revolut/oauth");
  }

  async function sync() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/revolut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Synchronisation impossible. Réessayez.");
        return;
      }
      setMessage(
        `Synchronisation terminée : ${json.fetched || 0} mouvement${
          (json.fetched || 0) > 1 ? "s" : ""
        } lu${(json.fetched || 0) > 1 ? "s" : ""}, ${json.inserted || 0} nouveau${
          (json.inserted || 0) > 1 ? "x" : ""
        }.`
      );
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function post(id: string, body: Record<string, unknown>, failure: string) {
    setRowBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/revolut/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || failure);
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setRowBusy(null);
    }
  }

  function match(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const customerId = String(fd.get("customer_id") || "");
    if (!customerId) {
      setError("Choisissez le client à créditer.");
      return;
    }
    void post(id, { customer_id: customerId }, "Rapprochement impossible. Réessayez.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={connect}
          disabled={!configured}
          className="rounded-full bg-[var(--admin-sky)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
        >
          Connecter Revolut
        </button>
        <button
          type="button"
          onClick={sync}
          disabled={busy || !configured || !connected}
          className="admin-af-btn rounded-full px-4 py-2 text-sm"
        >
          {busy ? "Synchronisation…" : "Synchroniser Revolut"}
        </button>
        {!configured ? (
          <p className="text-sm text-muted">
            Clés Revolut absentes côté serveur : l’intégration est désactivée. Le grand livre manuel reste disponible.
          </p>
        ) : !connected ? (
          <p className="text-sm text-muted">
            Clés présentes — cliquez sur Connecter Revolut (une fois, compte Business).
          </p>
        ) : null}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">
                  {r.counterparty_name || "Contrepartie inconnue"} ·{" "}
                  {formatMoney(Number(r.amount), r.currency)}
                </p>
                <p className="text-xs text-muted">
                  {formatDateFr(r.booked_at)} · {r.reference || r.revolut_transaction_id}
                </p>
                <StatusChip tone={revolutStatusTone(r.status)}>{revolutStatusLabel(r.status)}</StatusChip>
              </div>
              {r.status === "unmatched" ? (
                <form onSubmit={(e) => match(e, r.id)} className="flex flex-wrap items-center gap-2">
                  <select
                    name="customer_id"
                    required
                    disabled={rowBusy === r.id}
                    aria-label="Client à créditer"
                    className="rounded-xl border border-border px-3 py-1 text-sm"
                  >
                    <option value="">Rapprocher vers…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.last_name} {c.first_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={rowBusy === r.id}
                    className="admin-af-btn rounded-full px-3 py-1 text-sm"
                  >
                    {rowBusy === r.id ? "En cours…" : "Créditer"}
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy === r.id}
                    className="text-xs font-semibold text-muted"
                    onClick={() =>
                      void post(r.id, { action: "ignore" }, "Impossible d’ignorer ce mouvement.")
                    }
                  >
                    Ignorer
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
        {!rows.length ? (
          <li className="space-y-3 px-5 py-8 text-center text-sm text-muted">
            <p>{revolutInboxEmptyMessage({ configured, connected })}</p>
            {configured && !connected ? (
              <button
                type="button"
                onClick={connect}
                className="inline-flex rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white"
              >
                Connecter Revolut
              </button>
            ) : null}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
