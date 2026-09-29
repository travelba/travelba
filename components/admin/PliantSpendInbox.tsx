"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { StatusChip } from "@/components/crm/ui";
import { formatDateFr } from "@/lib/crm/money";
import { formatPliantAmount, pliantSpendStatusLabel, pliantSpendTitle, pliantSpendTypeLabel } from "@/lib/crm/pliant-spend";
import type { CrmPliantTransaction } from "@/lib/crm/types";

export type PliantSpendRow = CrmPliantTransaction & {
  reference: string | null;
  clientName: string | null;
};

function tone(status: string): "green" | "amber" | "red" | "navy" {
  if (status === "DECLINED") return "red";
  if (status === "PENDING") return "amber";
  if (status === "REVERSED") return "navy";
  return "green";
}

export function PliantSpendInbox({
  rows,
  configured,
}: {
  rows: PliantSpendRow[];
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/pliant/sync", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { error?: string; upserted?: number } | null;
      if (!res.ok) {
        setError(json?.error || "Synchronisation impossible.");
        return;
      }
      setMessage(
        json?.upserted
          ? `${json.upserted} dépense${json.upserted > 1 ? "s" : ""} à jour.`
          : "Aucune nouvelle dépense."
      );
      router.refresh();
    } catch {
      setError("Synchronisation impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Achats, retraits et remboursements de toutes les cartes.</p>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={busy || !configured}
          className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Synchronisation…" : "Synchroniser Pliant"}
        </button>
      </div>
      <BusyBar active={busy} label="Synchronisation des dépenses" />
      {!configured ? <p className="text-sm text-[var(--admin-navy)]">Pliant n’est pas branché.</p> : null}
      {message ? <p className="text-sm text-[var(--admin-navy)]">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="space-y-1">
              <p className="font-medium text-[var(--admin-navy)]">
                {pliantSpendTitle(row)} · {formatPliantAmount(row.amount_cents, row.currency)}
              </p>
              <p className="text-xs text-muted">
                {formatDateFr(row.booked_at)} · {pliantSpendTypeLabel(row.type)}
                {row.clientName ? ` · ${row.clientName}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={tone(row.status)}>{pliantSpendStatusLabel(row.status)}</StatusChip>
                {row.booking_id && row.reference ? (
                  <Link href={`/admin/reservations/${row.booking_id}`} className="text-xs font-semibold text-[#9e7e51]">
                    {row.reference}
                  </Link>
                ) : (
                  <span className="text-xs text-muted">Hors dossier</span>
                )}
              </div>
            </div>
          </li>
        ))}
        {!rows.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">
            Aucune dépense Pliant pour le moment. Synchronisez pour récupérer les achats.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
