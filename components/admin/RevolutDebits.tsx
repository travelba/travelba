"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutgoingAttach } from "@/components/admin/OutgoingAttach";
import { revolutDebitEmptyMessage } from "@/lib/crm/launch-status";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import type { RevolutDebitLine } from "@/lib/crm/revolut-inbox";
import type { OutgoingLine } from "@/lib/crm/trip-costs";

/** Sortie du compte : à pointer sur un dossier, pointée, ou hors voyage. */
export type RevolutDebitRow = RevolutDebitLine & {
  status: string;
  outgoing: OutgoingLine | null;
  cost: { bookingId: string; reference: string; itemLabel: string | null } | null;
};

/** Toutes les sorties Revolut, pointées ou non. Un débit ne crédite jamais un client. */
export function RevolutDebits({
  debits,
  configured,
  connected,
}: {
  debits: RevolutDebitRow[];
  configured: boolean;
  connected: boolean;
}) {
  const router = useRouter();
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"unmatched" | "all">("unmatched");
  const shown = scope === "unmatched" ? debits.filter((line) => line.status === "unmatched") : debits;

  async function restore(id: string) {
    setRowBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/comptabilite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", source: "revolut", id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Impossible de remettre cette sortie dans la file.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          Sorties du compte Revolut. Chacune se pointe sur une étape d’un dossier, ou reste hors voyage.
        </p>
        <button
          type="button"
          onClick={() => setScope((current) => (current === "unmatched" ? "all" : "unmatched"))}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
        >
          {scope === "unmatched" ? "Voir toutes les sorties" : "Seulement à pointer"}
        </button>
      </div>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <ul aria-label="Sorties Revolut" className="admin-af-card divide-y divide-border rounded-3xl">
        {shown.map((line) => (
          <li key={line.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">
                {line.party} · −{formatMoney(line.amount, line.currency)}
              </p>
              <p className="text-xs text-muted">
                {formatDateFr(line.bookedAt)}
                {` · ${line.kind}`}
                {line.reference ? ` · ${line.reference}` : ""}
              </p>
            </div>
            <div className="basis-full sm:basis-auto sm:max-w-md">
              {line.cost ? (
                <p className="text-sm font-semibold text-[var(--admin-navy)]">
                  <Link href={`/admin/reservations/${line.cost.bookingId}?tab=argent`} className="underline">
                    {line.cost.reference}
                  </Link>
                  {line.cost.itemLabel ? <span className="block text-xs font-normal text-muted">{line.cost.itemLabel}</span> : null}
                </p>
              ) : line.status === "ignored" ? (
                <p className="text-sm text-muted">
                  Hors voyage
                  <button
                    type="button"
                    disabled={rowBusy === line.id}
                    onClick={() => void restore(line.id)}
                    className="ml-2 text-xs font-semibold text-[#9e7e51] underline disabled:opacity-50"
                  >
                    Remettre dans la file
                  </button>
                </p>
              ) : line.outgoing ? (
                <OutgoingAttach line={line.outgoing} />
              ) : (
                <p className="text-sm text-muted">—</p>
              )}
            </div>
          </li>
        ))}
        {!shown.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">
            {debits.length && scope === "unmatched" ? "Aucune sortie à pointer." : revolutDebitEmptyMessage({ configured, connected })}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
