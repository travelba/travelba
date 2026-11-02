"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PliantMatchActions } from "@/components/admin/PliantMatchActions";
import { BusyBar } from "@/components/crm/BusyBar";
import { StatusChip } from "@/components/crm/ui";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { PliantAccountBalance } from "@/components/admin/PliantCardDesk";
import { PliantExpenseIdentity } from "@/components/admin/PliantExpenseIdentity";
import {
  pliantCardDisplay,
  pliantSignedCents,
  pliantStatusLabel,
  pliantStatusTone,
  pliantSyncSummary,
  pliantTypeLabel,
} from "@/lib/crm/pliant-tx";
import type { OutgoingLine } from "@/lib/crm/trip-costs";

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
  title: string | null;
  client: string | null;
  company: string | null;
  bookingId: string | null;
  matchStatus: "unmatched" | "matched" | "ignored";
  /** Sortie à rattacher (dépense comptabilisée, pas encore sur un voyage). */
  outgoing: OutgoingLine | null;
  /** Voyage auquel le coût est rattaché. */
  cost: { id: string; bookingId: string; reference: string; itemLabel: string | null } | null;
  /** Dernier geste de rattachement, déjà formulé. */
  auditLabel: string | null;
};

function lineView(row: PliantLine) {
  const signed = pliantSignedCents(row.type, row.billingCents);
  return {
    merchant: row.merchant || pliantTypeLabel(row.type),
    amount: signed == null ? "—" : euros(signed, row.currency),
    origin: originAmount(row),
    card: pliantCardDisplay(row.cardLabel, row.last4),
  };
}

function LineMeta({ row }: { row: PliantLine }) {
  const dossier = row.bookingId
    ? { reference: row.reference, title: row.title, client: row.client, company: row.company }
    : null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <PliantExpenseIdentity
        dossier={dossier}
        holderName={row.holderName}
        type={row.type}
        category={row.category}
        comment={row.comment}
        href={row.bookingId ? `/admin/reservations/${row.bookingId}?tab=argent` : null}
      />
      <StatusChip tone={pliantStatusTone(row.status)}>{pliantStatusLabel(row.status)}</StatusChip>
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

function needsMatch(row: PliantLine) {
  return row.matchStatus === "unmatched" && row.outgoing != null;
}

export function PliantAccount({
  configured,
  lines,
  account = null,
}: {
  configured: boolean;
  lines: PliantLine[];
  account?: { availableCents: number | null; currency: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "unmatched">("unmatched");
  const shown = scope === "unmatched" ? lines.filter(needsMatch) : lines;

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
      setMessage(pliantSyncSummary(json?.fetched || 0, 0));
      router.refresh();
    } catch {
      setError("Synchronisation Pliant impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string) {
    setRowBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pliant/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || "Impossible de remettre cette dépense dans la file.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setRowBusy(null);
    }
  }

  function tripCell(row: PliantLine) {
    if (row.cost || row.outgoing) {
      return <PliantMatchActions id={row.id} linked={row.cost} outgoing={row.outgoing} auditLabel={row.auditLabel} />;
    }
    if (row.matchStatus === "ignored") {
      return (
        <p className="text-sm text-muted">
          Hors voyage
          <button
            type="button"
            disabled={rowBusy === row.id}
            onClick={() => void restore(row.id)}
            className="ml-2 text-xs font-semibold text-[#9e7e51] underline disabled:opacity-50"
          >
            Remettre dans la file
          </button>
        </p>
      );
    }
    return <p className="text-sm text-muted">—</p>;
  }

  return (
    <div className="space-y-4">
      <BusyBar active={busy} label="Synchronisation…" />
      {configured ? (
        <div className="admin-af-card max-w-xs rounded-3xl px-5 py-4">
          <PliantAccountBalance account={account || { availableCents: null, currency: "EUR" }} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void sync()} disabled={busy || !configured} className="admin-af-btn rounded-full px-4 py-2 text-sm">
          {busy ? "Synchronisation…" : "Synchroniser Pliant"}
        </button>
        {configured ? (
          <p className="text-sm text-muted">Chaque dépense se pointe sur une étape d’un dossier. Rien ne part au client.</p>
        ) : null}
        <button
          type="button"
          onClick={() => setScope((current) => (current === "unmatched" ? "all" : "unmatched"))}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
        >
          {scope === "unmatched" ? "Toutes les dépenses" : "Seulement à pointer"}
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
                <LineMeta row={row} />
                {tripCell(row)}
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
                <th className="px-5 py-3">Voyage</th>
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
                      <LineMeta row={row} />
                    </td>
                    <td className="px-5 py-3 font-semibold text-[var(--admin-navy)]">{view.card.label}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums text-[var(--admin-navy)]">{view.card.number}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-[var(--admin-navy)]">
                      {view.amount}
                      {view.origin ? <span className="mt-0.5 block text-xs font-normal text-muted">{view.origin}</span> : null}
                    </td>
                    <td className="px-5 py-3">{tripCell(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!shown.length ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            {lines.length && scope === "unmatched"
              ? "Aucune dépense à rattacher."
              : configured
                ? "Aucune transaction pour le moment."
                : "Pliant n’est pas branché."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
