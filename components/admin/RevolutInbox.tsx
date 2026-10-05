"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmRevolutTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { revolutInboxEmptyMessage } from "@/lib/crm/launch-status";
import { revolutInboxCopy } from "@/lib/crm/revolut-inbox";
import { StatusChip } from "@/components/crm/ui";
import { BusyBar } from "@/components/crm/BusyBar";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { Icon } from "@/components/crm/icons";
import {
  customerPickLabel,
  type PickableCustomer,
} from "@/lib/crm/customer-search";
import {
  possibleClientsLabel,
  revolutStatusLabel,
  revolutStatusTone,
  revolutSyncSummary,
} from "@/lib/crm/revolut-labels";
import {
  matchReasonLabel,
  suggestedCustomerId,
  type RevolutMatchCandidate,
} from "@/lib/crm/revolut-match";

export function RevolutInbox({
  rows,
  customers,
  suggestions: suggestionsById,
  configured,
  connected,
  hasClientId,
  initialMessage = null,
}: {
  rows: CrmRevolutTransaction[];
  customers: PickableCustomer[];
  /** Candidats par ligne, calculés côté serveur (l’IBAN ne quitte pas le serveur). */
  suggestions: Record<string, RevolutMatchCandidate[]>;
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
  const [scope, setScope] = useState<"unmatched" | "all">("unmatched");
  const shown = scope === "unmatched" ? rows.filter((row) => row.status === "unmatched") : rows;

  const byId = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  const suggestions = useMemo(
    () => new Map<string, RevolutMatchCandidate[]>(Object.entries(suggestionsById)),
    [suggestionsById]
  );

  /** Présélection seulement sur un rapprochement certain et unique ; un partiel reste à choisir. */
  function chosenFor(rowId: string) {
    if (picked[rowId]) return picked[rowId];
    return suggestedCustomerId(suggestions.get(rowId) || []);
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
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setRowBusy(null);
    }
  }

  async function match(id: string, customerId: string, gross: number, currency: string) {
    if (!customerId) {
      setError("Choisissez le client à rapprocher.");
      setPickerRow(id);
      return;
    }
    const ok = await post(id, { customer_id: customerId }, "Rapprochement impossible. Réessayez.");
    if (!ok) return;
    setMessage(`Crédit enregistré : ${formatMoney(gross, currency)}.`);
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
      <BusyBar active={busy} label="Synchronisation…" />
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
            Crédits reçus — Valider ou Refuser. Auto si aucun doute.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setScope((current) => (current === "unmatched" ? "all" : "unmatched"))}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
        >
          {scope === "unmatched" ? "Voir tous les crédits" : "Seulement à rapprocher"}
        </button>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {shown.map((r) => {
          const candidates = suggestions.get(r.id) || [];
          const suggestedId = suggestedCustomerId(candidates);
          const top = suggestedId ? candidates.find((c) => c.customer_id === suggestedId) : undefined;
          const chosenId = chosenFor(r.id);
          const chosen = chosenId ? byId.get(chosenId) : undefined;
          const signed = `+${formatMoney(Number(r.amount), r.currency)}`;
          const { sender, designation } = revolutInboxCopy(r);
          return (
            <li key={r.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    {sender} · {signed}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateFr(r.booked_at)}
                    {designation ? ` · ${designation}` : ""}
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
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="w-full">
                      <BusyBar active={rowBusy === r.id} label="Rapprochement…" />
                    </div>
                    <button
                      type="button"
                      disabled={rowBusy === r.id}
                      onClick={() => setPickerRow(r.id)}
                      aria-haspopup="dialog"
                      aria-expanded={pickerRow === r.id}
                      aria-label="Choisir le client à rapprocher"
                      className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2 text-left text-sm text-[var(--admin-navy)] sm:min-w-[12rem] sm:max-w-xs sm:w-auto"
                    >
                      <span className="min-w-0 truncate">
                        {chosen
                          ? customerPickLabel(chosen)
                          : candidates.length
                            ? possibleClientsLabel(candidates.length)
                            : "Choisir un client…"}
                      </span>
                      <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy === r.id}
                      className="admin-af-btn rounded-full px-3 py-1 text-sm"
                      onClick={() => void match(r.id, chosenId, Number(r.amount), r.currency)}
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
        {!shown.length ? (
          <li className="space-y-3 px-5 py-8 text-center text-sm text-muted">
            <p>
              {rows.length && scope === "unmatched"
                ? "Aucun crédit à rapprocher."
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
