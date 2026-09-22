"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer, CrmRevolutTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { revolutInboxEmptyMessage } from "@/lib/crm/launch-status";
import { StatusChip } from "@/components/crm/ui";
import { revolutStatusLabel, revolutStatusTone, revolutSyncSummary } from "@/lib/crm/revolut-labels";
import {
  matchReasonLabel,
  scoreRevolutMatches,
  type RevolutMatchCandidate,
} from "@/lib/crm/revolut-match";
import { customerFullName } from "@/lib/crm/types";

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

  const suggestions = useMemo(() => {
    const map = new Map<string, RevolutMatchCandidate[]>();
    for (const r of rows) {
      if (r.status !== "unmatched") continue;
      map.set(r.id, scoreRevolutMatches(r, customers).candidates);
    }
    return map;
  }, [rows, customers]);

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
      setError("Choisissez le client à créditer.");
      return;
    }
    void post(id, { customer_id: customerId }, "Rapprochement impossible. Réessayez.");
  }

  return (
    <div className="space-y-4">
      {!hasClientId ? (
        <div className="admin-af-card space-y-2 rounded-3xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-[var(--admin-navy)]">
          <p className="font-semibold">Finaliser l’app Revolut Business</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>
              Dans Revolut Business → Settings → APIs → Business API, créez un certificat{" "}
              <strong className="font-semibold text-[var(--admin-navy)]">Production</strong>.
            </li>
            <li>
              Uploadez le certificat public fourni par l’agence (fichier{" "}
              <code className="rounded bg-white/80 px-1">revolut-travelba-public.cer</code>).
            </li>
            <li>
              Redirect URI exact :{" "}
              <code className="rounded bg-white/80 px-1">
                https://travelba.fr/api/admin/revolut/oauth
              </code>
            </li>
            <li>
              Envoyez le <strong className="font-semibold text-[var(--admin-navy)]">Client ID</strong>{" "}
              obtenu — il sera posé en variable Vercel <code className="rounded bg-white/80 px-1">REVOLUT_CLIENT_ID</code>{" "}
              (et <code className="rounded bg-white/80 px-1">REVOLUT_ISS</code>).
            </li>
            <li>
              Revenez ici et cliquez sur <strong className="font-semibold text-[var(--admin-navy)]">Connecter Revolut</strong>{" "}
              (SCA Business, une seule fois).
            </li>
          </ol>
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
        {!configured ? (
          <p className="text-sm text-muted">
            Clés Revolut incomplètes côté serveur (Client ID manquant). Le grand livre manuel reste disponible.
          </p>
        ) : !connected ? (
          <p className="text-sm text-muted">
            Clés présentes — cliquez sur Connecter Revolut (une fois, compte Business).
          </p>
        ) : (
          <p className="text-sm text-muted">
            Rapprochement automatique si un seul client correspond sans doute ; sinon proposition manuelle.
          </p>
        )}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {rows.map((r) => {
          const candidates = suggestions.get(r.id) || [];
          const top = candidates[0];
          const defaultCustomerId = top && top.score >= 55 ? top.customer_id : "";
          return (
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
                  <div className="flex flex-wrap items-center gap-2">
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
                      aria-label="Client à créditer"
                      className="rounded-xl border border-border px-3 py-1 text-sm"
                    >
                      <option value="">Rapprocher vers…</option>
                      {(candidates.length
                        ? [
                            ...candidates.map((c) => customers.find((x) => x.id === c.customer_id)!).filter(Boolean),
                            ...customers.filter((c) => !candidates.some((x) => x.customer_id === c.id)),
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
          );
        })}
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
