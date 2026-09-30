"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { StatusChip } from "@/components/crm/ui";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import {
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
  bookedAt: string | null;
  last4: string | null;
  reference: string | null;
  bookingId: string | null;
};

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
        {configured ? <p className="text-sm text-muted">Tous les mouvements du compte.</p> : null}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {lines.map((row) => {
          const signed = pliantSignedCents(row.type, row.billingCents);
          const amount = signed == null ? "—" : euros(signed, row.currency);
          return (
            <li key={row.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    {row.merchant || pliantTypeLabel(row.type)} · {amount}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateFr(row.bookedAt)}
                    {row.merchant ? ` · ${pliantTypeLabel(row.type)}` : ""}
                    {row.last4 ? ` · •••• ${row.last4}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={pliantStatusTone(row.status)}>{pliantStatusLabel(row.status)}</StatusChip>
                    {row.reference && row.bookingId ? (
                      <Link href={`/admin/reservations/${row.bookingId}`} className="text-xs font-semibold text-[#9e7e51] underline">
                        {row.reference}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {!lines.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">
            {configured ? "Aucune transaction pour le moment." : "Pliant n’est pas branché."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
