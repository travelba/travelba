"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmStripeTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { stripeInboxCopy } from "@/lib/crm/stripe-inbox";
import { matchStripeReasonLabel, stripeInboxMethodCaption } from "@/lib/crm/stripe-labels";

export type ClientStripeSuggestion = {
  row: CrmStripeTransaction;
  candidate: { customer_id: string; reason: string; label: string };
  certain: boolean;
};

export function ClientStripeSuggestions({ suggestions }: { suggestions: ClientStripeSuggestion[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!suggestions.length) return null;

  async function act(id: string, body: Record<string, unknown>, failure: string) {
    setBusyId(id);
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
      <h2 className="font-display text-lg font-bold">Paiements Stripe à rapprocher</h2>
      <p className="mt-1 text-sm text-muted">
        Proposition automatique sur un paiement reçu. Validez pour créditer ce client, ou refusez. Une
        correspondance partielle se rapproche depuis Stripe, après avoir choisi le client.
      </p>
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
      <ul className="mt-3 divide-y divide-border text-sm">
        {suggestions.map(({ row, candidate, certain }) => {
          const signed = `+${formatMoney(Number(row.amount), row.currency)}`;
          const { sender, designation } = stripeInboxCopy(row);
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {sender} · {signed}
                </p>
                <p className="text-xs text-muted">
                  {formatDateFr(row.booked_at)} · {stripeInboxMethodCaption(row.method, row.last4)} ·{" "}
                  {matchStripeReasonLabel(candidate.reason)}
                  {designation ? ` · ${designation}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {certain ? (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    className="admin-af-btn rounded-full px-3 py-1 text-sm"
                    onClick={() =>
                      void act(row.id, { customer_id: candidate.customer_id }, "Rapprochement impossible. Réessayez.")
                    }
                  >
                    {busyId === row.id ? "En cours…" : "Valider"}
                  </button>
                ) : (
                  <Link
                    href="/admin/stripe"
                    className="rounded-full border border-border px-3 py-1 text-sm font-semibold text-[var(--admin-navy)]"
                  >
                    Correspondance partielle — choisir dans Stripe
                  </Link>
                )}
                <button
                  type="button"
                  disabled={busyId === row.id}
                  className="text-xs font-semibold text-muted"
                  onClick={() => void act(row.id, { action: "refuse" }, "Impossible de refuser ce paiement.")}
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
