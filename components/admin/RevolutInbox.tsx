"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer, CrmRevolutTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { revolutInboxEmptyMessage } from "@/lib/crm/launch-status";
import { StatusChip } from "@/components/crm/ui";
import {
  revolutDirectionLabel,
  revolutDirectionTone,
  revolutStatusLabel,
  revolutStatusTone,
  revolutSyncSummary,
} from "@/lib/crm/revolut-labels";
import {
  matchReasonLabel,
  scoreRevolutMatches,
  type RevolutMatchCandidate,
} from "@/lib/crm/revolut-match";
import { customerFullName } from "@/lib/crm/types";

type Filter = "all" | "credit" | "debit";

function customerOptionLabel(c: CrmCustomer) {
  const name = customerFullName(c);
  return c.company_name?.trim() ? `${name} · ${c.company_name.trim()}` : name;
}

export function RevolutInbox({
  rows,
  customers,
  configured,
  connected,
  hasClientId,
  initialMessage = null,
}: {
  rows: CrmRevolutTransaction[];
  customers: CrmCustomer[];
  configured: boolean;
  connected: boolean;
  hasClientId: boolean;
  initialMessage?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const suggestions = useMemo(() => {
    const map = new Map<string, RevolutMatchCandidate[]>();
    for (const r of rows) {
      if (r.status !== "unmatched") continue;
      map.set(r.id, scoreRevolutMatches(r, customers).candidates);
    }
    return map;
  }, [rows, customers]);

  const counts = useMemo(() => {
    const unmatched = rows.filter((r) => r.status === "unmatched");
    return {
      all: unmatched.length,
      credit: unmatched.filter((r) => (r.direction || "credit") === "credit").length,
      debit: unmatched.filter((r) => r.direction === "debit").length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "all") return true;
      const dir = r.direction || "credit";
      return dir === filter;
    });
  }, [rows, filter]);

  function connect() {
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
        revolutSyncSummary(
          Number(json.fetched || 0),
          Number(json.inserted || 0),
          Number(json.auto_matched || 0)
        )
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
      setError("Choisissez le client à rapprocher.");
      return;
    }
    void post(id, { customer_id: customerId }, "Rapprochement impossible. Réessayez.");
  }

  function filterBtn(id: Filter, label: string, count: number) {
    const active = filter === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setFilter(id)}
        className={`rounded-full px-3 py-1 text-sm font-semibold ${
          active
            ? "bg-[var(--admin-navy)] text-white"
            : "border border-border text-[var(--admin-navy)]"
        }`}
      >
        {label}
        <span className="ml-1 opacity-70">{count}</span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {!hasClientId ? (
        <div className="admin-af-card space-y-2 rounded-3xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-[var(--admin-navy)]">
          <p className="font-semibold">Finaliser l’app Revolut Business</p>
          <p className="text-muted">
            Client ID manquant côté serveur. Après connexion, revenus et dépenses apparaîtront ici.
          </p>
        </div>
      ) : null}
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
        {configured && connected ? (
          <p className="text-sm text-muted">
            Proposition de client pré-sélectionnée — Valider ou Refuser. Auto si aucun doute.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {filterBtn("all", "Tous", counts.all)}
        {filterBtn("credit", "Revenus", counts.credit)}
        {filterBtn("debit", "Dépenses", counts.debit)}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {visible.map((r) => {
          const candidates = suggestions.get(r.id) || [];
          const top = candidates[0];
          const defaultCustomerId = top && top.score >= 55 ? top.customer_id : "";
          const direction = r.direction || "credit";
          const signed =
            direction === "debit"
              ? `−${formatMoney(Number(r.amount), r.currency)}`
              : `+${formatMoney(Number(r.amount), r.currency)}`;
          return (
            <li key={r.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    {r.counterparty_name || "Contrepartie inconnue"} · {signed}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateFr(r.booked_at)} · {r.reference || r.revolut_transaction_id}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={revolutDirectionTone(direction)}>
                      {revolutDirectionLabel(direction)}
                    </StatusChip>
                    <StatusChip tone={revolutStatusTone(r.status)}>
                      {revolutStatusLabel(r.status)}
                    </StatusChip>
                    {r.status === "unmatched" && top ? (
                      <span className="text-xs font-semibold text-[#9e7e51]">
                        Proposition : {top.label} ({matchReasonLabel(top.reason)})
                      </span>
                    ) : null}
                  </div>
                </div>
                {r.status === "unmatched" ? (
                  <form
                    onSubmit={(e) => match(e, r.id)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <select
                      name="customer_id"
                      required
                      defaultValue={defaultCustomerId}
                      disabled={rowBusy === r.id}
                      aria-label="Client à rapprocher"
                      className="rounded-xl border border-border px-3 py-1 text-sm"
                    >
                      <option value="">Choisir un client…</option>
                      {(candidates.length
                        ? [
                            ...candidates
                              .map((c) => customers.find((x) => x.id === c.customer_id)!)
                              .filter(Boolean),
                            ...customers.filter(
                              (c) => !candidates.some((x) => x.customer_id === c.id)
                            ),
                          ]
                        : customers
                      ).map((c) => (
                        <option key={c.id} value={c.id}>
                          {customerOptionLabel(c)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={rowBusy === r.id}
                      className="admin-af-btn rounded-full px-3 py-1 text-sm"
                    >
                      {rowBusy === r.id ? "En cours…" : "Valider"}
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy === r.id}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted"
                      onClick={() =>
                        void post(r.id, { action: "refuse" }, "Impossible de refuser ce mouvement.")
                      }
                    >
                      Refuser
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
        {!visible.length ? (
          <li className="space-y-3 px-5 py-8 text-center text-sm text-muted">
            <p>
              {rows.length
                ? "Aucun mouvement dans ce filtre."
                : revolutInboxEmptyMessage({ configured, connected })}
            </p>
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
