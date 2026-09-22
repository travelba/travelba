"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmRevolutTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney, agencyFeeFromGross, netAfterAgencyFee } from "@/lib/crm/money";
import {
  matchReasonLabel,
  type RevolutMatchCandidate,
} from "@/lib/crm/revolut-match";

export type ClientRevolutSuggestion = {
  row: CrmRevolutTransaction;
  candidate: RevolutMatchCandidate;
};

export function ClientRevolutSuggestions({
  suggestions,
}: {
  suggestions: ClientRevolutSuggestion[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!suggestions.length) return null;

  async function act(id: string, body: Record<string, unknown>, failure: string) {
    setBusyId(id);
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
      setBusyId(null);
    }
  }

  return (
    <section className="admin-af-card rounded-3xl p-5">
      <h2 className="font-display text-lg font-bold">Mouvements Revolut à rapprocher</h2>
      <p className="mt-1 text-sm text-muted">
        Proposition automatique sur un crédit reçu. Validez pour créditer ce client, ou refusez.
      </p>
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
      <ul className="mt-3 divide-y divide-border text-sm">
        {suggestions.map(({ row, candidate }) => {
          const signed = `+${formatMoney(Number(row.amount), row.currency)}`;
          const fee = agencyFeeFromGross(Number(row.amount));
          const net = netAfterAgencyFee(Number(row.amount));
          return (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">
                {row.counterparty_name || "Contrepartie inconnue"} · {signed}
              </p>
              <p className="text-xs text-muted">
                {formatDateFr(row.booked_at)} · {matchReasonLabel(candidate.reason)}
                {row.reference ? ` · ${row.reference}` : ""}
              </p>
              {net != null ? (
                <p className="text-xs text-[#9e7e51]">
                  Frais 10 % {formatMoney(fee, row.currency)} → crédit dispo.{" "}
                  {formatMoney(net, row.currency)}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyId === row.id}
                className="admin-af-btn rounded-full px-3 py-1 text-sm"
                onClick={() =>
                  void act(
                    row.id,
                    { customer_id: candidate.customer_id },
                    "Rapprochement impossible. Réessayez."
                  )
                }
              >
                {busyId === row.id ? "En cours…" : "Valider"}
              </button>
              <button
                type="button"
                disabled={busyId === row.id}
                className="text-xs font-semibold text-muted"
                onClick={() =>
                  void act(row.id, { action: "refuse" }, "Impossible de refuser ce mouvement.")
                }
              >
                Refuser
              </button>
            </div>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
