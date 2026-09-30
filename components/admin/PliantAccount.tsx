"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerPickDialog } from "@/components/admin/CustomerPickDialog";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { StatusChip } from "@/components/crm/ui";
import {
  customerPickLabel,
  type PickableCustomer,
} from "@/lib/crm/customer-search";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import {
  pliantLedgerDraft,
  pliantMatchReasonLabel,
  scorePliantMatches,
  type PliantMatchCandidate,
} from "@/lib/crm/pliant-match";
import {
  pliantCardDisplay,
  pliantCategoryLabel,
  pliantSignedCents,
  pliantStatusLabel,
  pliantStatusTone,
  pliantSyncSummary,
  pliantTypeLabel,
} from "@/lib/crm/pliant-tx";

export type PliantLine = {
  id: string;
  merchant: string | null;
  status: string | null;
  type: string | null;
  billingCents: number | null;
  currency: string | null;
  transactionCents: number | null;
  transactionCurrency: string | null;
  bookedAt: string | null;
  cardLabel: string | null;
  last4: string | null;
  holderName: string | null;
  category: string | null;
  comment: string | null;
  reference: string | null;
  bookingId: string | null;
  matchStatus: "unmatched" | "matched" | "ignored";
  matchedCustomerId: string | null;
  linkedCustomerIds: string[];
};

function lineView(row: PliantLine) {
  const signed = pliantSignedCents(row.type, row.billingCents);
  return {
    merchant: row.merchant || pliantTypeLabel(row.type),
    amount: signed == null ? "—" : euros(signed, row.currency),
    origin: originAmount(row),
    card: pliantCardDisplay(row.cardLabel, row.last4),
    category: pliantCategoryLabel(row.category),
  };
}

function LineMeta({ row, view }: { row: PliantLine; view: ReturnType<typeof lineView> }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">
        {row.holderName ? `${row.holderName} · ` : ""}
        {pliantTypeLabel(row.type)}
        {view.category ? ` · ${view.category}` : ""}
        {row.comment ? ` · ${row.comment}` : ""}
      </span>
      <StatusChip tone={pliantStatusTone(row.status)}>{pliantStatusLabel(row.status)}</StatusChip>
      {row.reference && row.bookingId ? (
        <Link href={`/admin/reservations/${row.bookingId}`} className="text-xs font-semibold text-[#9e7e51] underline">
          {row.reference}
        </Link>
      ) : null}
    </div>
  );
}

function originAmount(row: PliantLine) {
  if (row.transactionCents == null || !row.transactionCurrency) return null;
  if (row.transactionCurrency.toUpperCase() === (row.currency || "EUR").toUpperCase()) return null;
  const signed = pliantSignedCents(row.type, row.transactionCents);
  if (signed == null || signed === 0) return null;
  return euros(signed, row.transactionCurrency);
}

function euros(cents: number, currency: string | null) {
  try {
    return formatMoney(cents / 100, currency || "EUR");
  } catch {
    return formatMoney(cents / 100, "EUR");
  }
}

function ledgerOf(row: PliantLine) {
  return pliantLedgerDraft({
    pliant_transaction_id: row.id,
    type: row.type,
    status: row.status,
    merchant: row.merchant,
    billing_cents: row.billingCents,
    billing_currency: row.currency,
    booked_at: row.bookedAt,
    card_label: row.cardLabel,
    card_last4: row.last4,
  });
}

function needsMatch(row: PliantLine) {
  return row.matchStatus === "unmatched" && ledgerOf(row) != null;
}

export function PliantAccount({
  configured,
  lines,
  customers,
}: {
  configured: boolean;
  lines: PliantLine[];
  customers: PickableCustomer[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "unmatched">("all");
  const shown = scope === "unmatched" ? lines.filter(needsMatch) : lines;
  const byId = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const suggestions = useMemo(() => {
    const map = new Map<string, PliantMatchCandidate[]>();
    for (const row of lines) {
      if (!needsMatch(row)) continue;
      map.set(
        row.id,
        scorePliantMatches({ card_label: row.cardLabel }, customers, {
          linkedCustomerIds: row.linkedCustomerIds,
        }).candidates
      );
    }
    return map;
  }, [lines, customers]);

  function chosenFor(rowId: string) {
    if (picked[rowId]) return picked[rowId];
    const top = suggestions.get(rowId)?.[0];
    return top && top.score >= 55 ? top.customer_id : "";
  }

  async function sync() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/pliant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        fetched?: number;
        auto_matched?: number;
      } | null;
      if (!res.ok) {
        setError(json?.error || "Synchronisation Pliant impossible. Réessayez.");
        return;
      }
      setMessage(pliantSyncSummary(json?.fetched || 0, json?.auto_matched || 0));
      router.refresh();
    } catch {
      setError("Synchronisation Pliant impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function post(id: string, body: Record<string, unknown>, failure: string) {
    setRowBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pliant/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || failure);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Connexion interrompue. Réessayez.");
      return false;
    } finally {
      setRowBusy(null);
    }
  }

  async function validate(row: PliantLine) {
    const customerId = chosenFor(row.id);
    if (!customerId) {
      setError("Choisissez le client à rapprocher.");
      setPickerRow(row.id);
      return;
    }
    const draft = ledgerOf(row);
    const ok = await post(row.id, { customer_id: customerId }, "Rapprochement impossible. Réessayez.");
    if (!ok || !draft) return;
    const amount = formatMoney(draft.amount, draft.currency);
    setMessage(draft.direction === "credit" ? `Remboursement enregistré : ${amount}.` : `Dépense enregistrée : ${amount}.`);
  }

  function matchCell(row: PliantLine) {
    if (row.matchStatus === "matched") {
      const client = row.matchedCustomerId ? byId.get(row.matchedCustomerId) : undefined;
      return <p className="text-sm font-semibold text-[var(--admin-navy)]">{client ? customerPickLabel(client) : "Rapprochée"}</p>;
    }
    if (row.matchStatus === "ignored") return <p className="text-sm text-muted">Ignorée</p>;
    if (!needsMatch(row)) return <p className="text-sm text-muted">—</p>;
    const top = suggestions.get(row.id)?.[0];
    const chosen = byId.get(chosenFor(row.id));
    return (
      <div className="flex w-full flex-col gap-2 sm:max-w-xs">
        {top ? (
          <p className="text-xs font-semibold text-[#9e7e51]">
            Proposition : {top.label} ({pliantMatchReasonLabel(top.reason)})
          </p>
        ) : (
          <p className="text-xs text-muted">Aucune proposition</p>
        )}
        <BusyBar active={rowBusy === row.id} label="Rapprochement…" />
        <button
          type="button"
          disabled={rowBusy === row.id}
          onClick={() => setPickerRow(row.id)}
          aria-haspopup="dialog"
          aria-expanded={pickerRow === row.id}
          aria-label="Choisir le client à rapprocher"
          className="inline-flex items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2 text-left text-sm text-[var(--admin-navy)]"
        >
          <span className="min-w-0 truncate">{chosen ? customerPickLabel(chosen) : "Choisir un client…"}</span>
          <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={rowBusy === row.id}
            className="admin-af-btn rounded-full px-3 py-1 text-sm"
            onClick={() => void validate(row)}
          >
            {rowBusy === row.id ? "En cours…" : "Valider"}
          </button>
          <button
            type="button"
            disabled={rowBusy === row.id}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted"
            onClick={() => void post(row.id, { action: "refuse" }, "Impossible de refuser cette dépense.")}
          >
            Refuser
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BusyBar active={busy} label="Synchronisation…" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void sync()} disabled={busy || !configured} className="admin-af-btn rounded-full px-4 py-2 text-sm">
          {busy ? "Synchronisation…" : "Synchroniser Pliant"}
        </button>
        {configured ? (
          <p className="text-sm text-muted">Imputation automatique seulement si le libellé désigne un seul client.</p>
        ) : null}
        <button
          type="button"
          onClick={() => setScope((current) => (current === "unmatched" ? "all" : "unmatched"))}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
        >
          {scope === "unmatched" ? "Toutes les dépenses" : "Seulement à rapprocher"}
        </button>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="admin-af-card overflow-hidden rounded-3xl">
        <ul className="divide-y divide-border md:hidden">
          {shown.map((row) => {
            const view = lineView(row);
            return (
              <li key={row.id} className="space-y-2 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-[var(--admin-navy)]">{view.merchant}</p>
                  <p className="shrink-0 text-right font-medium tabular-nums text-[var(--admin-navy)]">
                    {view.amount}
                    {view.origin ? <span className="mt-0.5 block text-xs font-normal text-muted">{view.origin}</span> : null}
                  </p>
                </div>
                <p className="text-xs text-muted">{formatDateFr(row.bookedAt)}</p>
                <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">Libellé</dt>
                  <dd className="font-semibold text-[var(--admin-navy)]">{view.card.label}</dd>
                  <dt className="text-muted">Carte</dt>
                  <dd className="font-semibold tabular-nums text-[var(--admin-navy)]">{view.card.number}</dd>
                </dl>
                <LineMeta row={row} view={view} />
                {matchCell(row)}
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--admin-sky)]/70 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Dépense</th>
                <th className="px-5 py-3">Libellé</th>
                <th className="px-5 py-3">Carte</th>
                <th className="px-5 py-3 text-right">Montant</th>
                <th className="px-5 py-3">Compte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((row) => {
                const view = lineView(row);
                return (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-3 text-muted">{formatDateFr(row.bookedAt)}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-[var(--admin-navy)]">{view.merchant}</p>
                      <LineMeta row={row} view={view} />
                    </td>
                    <td className="px-5 py-3 font-semibold text-[var(--admin-navy)]">{view.card.label}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums text-[var(--admin-navy)]">{view.card.number}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-[var(--admin-navy)]">
                      {view.amount}
                      {view.origin ? <span className="mt-0.5 block text-xs font-normal text-muted">{view.origin}</span> : null}
                    </td>
                    <td className="px-5 py-3">{matchCell(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!shown.length ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            {lines.length && scope === "unmatched"
              ? "Aucune dépense à rapprocher."
              : configured
                ? "Aucune transaction pour le moment."
                : "Pliant n’est pas branché."}
          </p>
        ) : null}
      </div>
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
