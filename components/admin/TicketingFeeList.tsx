"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { formatMoney } from "@/lib/crm/money";

export type TicketingFeeRow = {
  id: string;
  bookingId: string;
  reference: string;
  title: string;
  client: string;
  amount: number | null;
  currency: string;
  kept: boolean;
};

/** Une ligne à la fois. Pas de suppression de toute la liste. */
export function TicketingFeeList({ rows }: { rows: TicketingFeeRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function keep(row: TicketingFeeRow) {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/billeterie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "garder", item_id: row.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Enregistrement impossible.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: TicketingFeeRow) {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${row.bookingId}/items?itemId=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Suppression impossible.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) {
    return <p className="mt-4 text-sm text-muted">Aucun frais de billeterie automatique en attente.</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      <BusyBar active={Boolean(busy)} label="Enregistrement…" />
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <ul className="admin-af-card divide-y divide-border rounded-3xl">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Link href={`/admin/reservations/${row.bookingId}`} className="font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline">
                {row.reference}
              </Link>
              <p className="text-sm text-[var(--admin-navy)]">{row.title}</p>
              <p className="text-xs text-muted">
                {row.client}
                {row.amount != null ? ` · ${formatMoney(row.amount, row.currency)}` : ""}
                {row.kept ? " · Conservé" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.kept ? null : (
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => void keep(row)}
                  className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-[var(--admin-navy)]"
                >
                  Garder
                </button>
              )}
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => void remove(row)}
                className="rounded-full border border-accent/40 px-3 py-1.5 text-sm font-semibold text-accent"
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
