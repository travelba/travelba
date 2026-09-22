"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmRevolutTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney, netAfterAgencyFee, agencyFeeFromGross } from "@/lib/crm/money";
import { revolutInboxEmptyMessage } from "@/lib/crm/launch-status";
import { StatusChip } from "@/components/crm/ui";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { Icon } from "@/components/crm/icons";
import {
  customerPickLabel,
  type PickableCustomer,
} from "@/lib/crm/customer-search";
import {
  revolutStatusLabel,
  revolutStatusTone,
  revolutSyncSummary,
} from "@/lib/crm/revolut-labels";
import {
  matchReasonLabel,
  scoreRevolutMatches,
  type RevolutMatchCandidate,
} from "@/lib/crm/revolut-match";

export function RevolutInbox({
  rows,
  customers,
  configured,
  connected,
  hasClientId,
  initialMessage = null,
}: {
  rows: CrmRevolutTransaction[];
  customers: PickableCustomer[];
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
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [pickerRow, setPickerRow] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  const suggestions = useMemo(() => {
    const map = new Map<string, RevolutMatchCandidate[]>();
    for (const r of rows) {
      if (r.status !== "unmatched") continue;
      map.set(r.id, scoreRevolutMatches(r, customers).candidates);
    }
    return map;
  }, [rows, customers]);

  function chosenFor(rowId: string) {
    if (picked[rowId]) return picked[rowId];
    const top = suggestions.get(rowId)?.[0];
    return top && top.score >= 55 ? top.customer_id : "";
  }

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

  function match(id: string, customerId: string) {
    if (!customerId) {
      setError("Choisissez le client à rapprocher.");
      setPickerRow(id);
      return;
    }
    void post(id, { customer_id: customerId }, "Rapprochement impossible. Réessayez.");
  }

  return (
    <div className="space-y-4">
      {!hasClientId ? (
        <div className="admin-af-card space-y-2 rounded-3xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-[var(--admin-navy)]">
          <p className="font-semibold">Finaliser l’app Revolut Business</p>
          <p className="text-muted">
            Client ID manquant côté serveur. Après connexion, les virements reçus apparaîtront ici.
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
            Uniquement les crédits reçus — Valider ou Refuser. Auto si aucun doute.
          </p>
        ) : null}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {rows.map((r) => {
          const candidates = suggestions.get(r.id) || [];
          const top = candidates[0];
          const chosenId = chosenFor(r.id);
          const chosen = chosenId ? byId.get(chosenId) : undefined;
          const signed = `+${formatMoney(Number(r.amount), r.currency)}`;
          const fee = agencyFeeFromGross(Number(r.amount));
          const net = netAfterAgencyFee(Number(r.amount));
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
                    <StatusChip tone={revolutStatusTone(r.status)}>
                      {revolutStatusLabel(r.status)}
                    </StatusChip>
                    {r.status === "unmatched" && top ? (
                      <span className="text-xs font-semibold text-[#9e7e51]">
                        Proposition : {top.label} ({matchReasonLabel(top.reason)})
                      </span>
                    ) : null}
                    {net != null ? (
                      <span className="text-xs text-muted">
                        Frais 10 % {formatMoney(fee, r.currency)} → crédit dispo.{" "}
                        <strong className="text-[var(--admin-navy)]">
                          {formatMoney(net, r.currency)}
                        </strong>
                      </span>
                    ) : null}
                  </div>
                </div>
                {r.status === "unmatched" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={rowBusy === r.id}
                      onClick={() => setPickerRow(r.id)}
                      aria-haspopup="dialog"
                      aria-expanded={pickerRow === r.id}
                      aria-label="Choisir le client à rapprocher"
                      className="inline-flex min-w-[12rem] max-w-xs items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2 text-left text-sm text-[var(--admin-navy)]"
                    >
                      <span className="min-w-0 truncate">
                        {chosen ? customerPickLabel(chosen) : "Choisir un client…"}
                      </span>
                      <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy === r.id}
                      className="admin-af-btn rounded-full px-3 py-1 text-sm"
                      onClick={() => match(r.id, chosenId)}
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
                  </div>
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
      <CustomerPickDialog
        open={Boolean(pickerRow)}
        customers={customers}
        suggestedIds={pickerRow ? (suggestions.get(pickerRow) || []).map((c) => c.customer_id) : []}
        selectedId={pickerRow ? chosenFor(pickerRow) : ""}
        title="Rapprocher vers un client"
        onSelect={(customer) => {
          if (!pickerRow) return;
          setPicked((current) => ({ ...current, [pickerRow]: customer.id }));
          setError(null);
        }}
        onClose={() => setPickerRow(null)}
      />
    </div>
  );
}
