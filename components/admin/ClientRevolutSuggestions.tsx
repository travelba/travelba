"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmRevolutTransaction } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { revolutInboxCopy } from "@/lib/crm/revolut-inbox";
import {
  matchReasonLabel,
  type RevolutMatchCandidate,
} from "@/lib/crm/revolut-match";

export type ClientRevolutSuggestion = {
  row: CrmRevolutTransaction;
  candidate: RevolutMatchCandidate;
  /** Ce client est le seul candidat certain (≥ 90) dans tout le CRM. Sinon : choisir dans Revolut. */
  certain: boolean;
};

export function ClientRevolutSuggestions({
  suggestions,
  accounts = [],
}: {
  suggestions: ClientRevolutSuggestion[];
  /** Crédit et Pro : le virement reçu attend le compte. */
  accounts?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");

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
        Proposition automatique sur un crédit reçu. Validez pour créditer ce client, ou refusez. Une
        correspondance partielle se rapproche depuis Revolut, après avoir choisi le client.
      </p>
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
      <ul className="mt-3 divide-y divide-border text-sm">
        {suggestions.map(({ row, candidate, certain }) => {
          const signed = `+${formatMoney(Number(row.amount), row.currency)}`;
          const { sender, designation } = revolutInboxCopy(row);
          return (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">
                {sender} · {signed}
              </p>
              <p className="text-xs text-muted">
                {formatDateFr(row.booked_at)} · {matchReasonLabel(candidate.reason)}
                {designation ? ` · ${designation}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {certain && accounts.length > 1 ? (
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Compte
                  <select
                    value={accountId}
                    disabled={busyId === row.id}
                    onChange={(event) => setAccountId(event.target.value)}
                    aria-label="Compte qui reçoit le virement"
                    className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[var(--admin-navy)]"
                  >
                    <option value="">Choisir…</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {certain ? (
                <button
                  type="button"
                  disabled={busyId === row.id}
                  className="admin-af-btn rounded-full px-3 py-1 text-sm"
                  onClick={() => {
                    if (accounts.length > 1 && !accounts.some((account) => account.id === accountId)) {
                      setError("Choisissez le compte : crédit ou Pro.");
                      return;
                    }
                    void act(
                      row.id,
                      { customer_id: candidate.customer_id, billing_company_id: accountId || null },
                      "Rapprochement impossible. Réessayez."
                    );
                  }}
                >
                  {busyId === row.id ? "En cours…" : "Valider"}
                </button>
              ) : (
                <Link
                  href="/admin/revolut"
                  className="rounded-full border border-border px-3 py-1 text-sm font-semibold text-[var(--admin-navy)]"
                >
                  Correspondance partielle — choisir dans Revolut
                </Link>
              )}
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
