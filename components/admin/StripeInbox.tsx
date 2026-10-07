"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmStripeTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { stripeInboxEmptyMessage } from "@/lib/crm/launch-status";
import { stripeInboxCopy, stripeSuggestedCustomerId } from "@/lib/crm/stripe-inbox";
import { StatusChip } from "@/components/crm/ui";
import { BusyBar } from "@/components/crm/BusyBar";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { Icon } from "@/components/crm/icons";
import { customerPickLabel, type PickableCustomer } from "@/lib/crm/customer-search";
import {
  matchStripeReasonLabel,
  stripeInboxMethodCaption,
  stripePossibleClientsLabel,
  stripeStatusLabel,
  stripeStatusTone,
  stripeSyncSummary,
} from "@/lib/crm/stripe-labels";

type StripeSuggestion = {
  customer_id: string;
  score: number;
  reason: string;
  label: string;
};

export function StripeInbox({
  rows,
  customers,
  suggestions: suggestionsById,
  configured,
}: {
  rows: CrmStripeTransaction[];
  customers: PickableCustomer[];
  suggestions: Record<string, StripeSuggestion[]>;
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const [scope, setScope] = useState<"unmatched" | "all">("unmatched");
  const shown = scope === "unmatched" ? rows.filter((row) => row.status === "unmatched") : rows;

  const byId = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const suggestions = useMemo(
    () => new Map<string, StripeSuggestion[]>(Object.entries(suggestionsById)),
    [suggestionsById]
  );

  function chosenFor(rowId: string) {
    if (picked[rowId]) return picked[rowId];
    return stripeSuggestedCustomerId(suggestions.get(rowId) || []);
  }

  async function sync() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/stripe", {
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
        stripeSyncSummary(Number(json.fetched || 0), Number(json.inserted || 0), Number(json.auto_matched || 0))
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
      const res = await fetch(`/api/admin/stripe/${id}`, {
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
      <BusyBar active={busy} label="Synchronisation…" />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={sync}
          disabled={busy || !configured}
          className="admin-af-btn rounded-full px-4 py-2 text-sm"
        >
          {busy ? "Synchronisation…" : "Synchroniser Stripe"}
        </button>
        {configured ? (
          <p className="text-sm text-muted">Crédits reçus — Valider ou Refuser. Auto si aucun doute.</p>
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
        {shown.map((row) => {
          const candidates = suggestions.get(row.id) || [];
          const suggestedId = stripeSuggestedCustomerId(candidates);
          const top = suggestedId ? candidates.find((candidate) => candidate.customer_id === suggestedId) : undefined;
          const chosenId = chosenFor(row.id);
          const chosen = chosenId ? byId.get(chosenId) : undefined;
          const signed = `+${formatMoney(Number(row.amount), row.currency)}`;
          const { sender, designation } = stripeInboxCopy(row);
          const method = stripeInboxMethodCaption(row.method, row.last4);
          return (
            <li key={row.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    {sender} · {signed}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateFr(row.booked_at)} · {method}
                    {designation ? ` · ${designation}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={stripeStatusTone(row.status)}>{stripeStatusLabel(row.status)}</StatusChip>
                    {row.status === "unmatched" && top ? (
                      <span className="text-xs font-semibold text-[#9e7e51]">
                        Proposition : {top.label} ({matchStripeReasonLabel(top.reason)})
                      </span>
                    ) : null}
                  </div>
                </div>
                {row.status === "unmatched" ? (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="w-full">
                      <BusyBar active={rowBusy === row.id} label="Rapprochement…" />
                    </div>
                    <button
                      type="button"
                      disabled={rowBusy === row.id}
                      onClick={() => setPickerRow(row.id)}
                      aria-haspopup="dialog"
                      aria-expanded={pickerRow === row.id}
                      aria-label="Choisir le client à rapprocher"
                      className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2 text-left text-sm text-[var(--admin-navy)] sm:min-w-[12rem] sm:max-w-xs sm:w-auto"
                    >
                      <span className="min-w-0 truncate">
                        {chosen
                          ? customerPickLabel(chosen)
                          : candidates.length
                            ? stripePossibleClientsLabel(candidates.length)
                            : "Choisir un client…"}
                      </span>
                      <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy === row.id}
                      className="admin-af-btn rounded-full px-3 py-1 text-sm"
                      onClick={() => void match(row.id, chosenId, Number(row.amount), row.currency)}
                    >
                      {rowBusy === row.id ? "En cours…" : "Valider"}
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy === row.id}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted"
                      onClick={() =>
                        void post(row.id, { action: "refuse" }, "Impossible de refuser ce paiement.")
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
          <li className="px-5 py-8 text-center text-sm text-muted">
            {rows.length && scope === "unmatched"
              ? "Aucun crédit à rapprocher."
              : stripeInboxEmptyMessage({ configured })}
          </li>
        ) : null}
      </ul>
      <CustomerPickDialog
        open={Boolean(pickerRow)}
        customers={customers}
        suggestedIds={pickerRow ? (suggestions.get(pickerRow) || []).map((candidate) => candidate.customer_id) : []}
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
