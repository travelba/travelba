"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { StatusChip } from "@/components/crm/ui";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
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

export function PliantAccount({ configured, lines }: { configured: boolean; lines: PliantLine[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const json = (await res.json().catch(() => null)) as { error?: string; fetched?: number } | null;
      if (!res.ok) {
        setError(json?.error || "Synchronisation Pliant impossible. Réessayez.");
        return;
      }
      setMessage(pliantSyncSummary(json?.fetched || 0));
      router.refresh();
    } catch {
      setError("Synchronisation Pliant impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <BusyBar active={busy} label="Synchronisation…" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void sync()} disabled={busy || !configured} className="admin-af-btn rounded-full px-4 py-2 text-sm">
          {busy ? "Synchronisation…" : "Synchroniser Pliant"}
        </button>
        {configured ? <p className="text-sm text-muted">Chaque dépense indique le libellé de la carte et la carte.</p> : null}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="admin-af-card overflow-hidden rounded-3xl">
        <ul className="divide-y divide-border md:hidden">
          {lines.map((row) => {
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((row) => {
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!lines.length ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            {configured ? "Aucune transaction pour le moment." : "Pliant n’est pas branché."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
