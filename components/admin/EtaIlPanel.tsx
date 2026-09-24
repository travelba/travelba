"use client";

import { useState } from "react";
import type { EtaIlPersonView, EtaIlPhase } from "@/lib/crm/eta-il-draft";

type View = {
  phase: EtaIlPhase;
  portal: string;
  reason: string | null;
  startDate: string | null;
  endDate: string | null;
  travelers: EtaIlPersonView[];
  summary?: string | null;
};

export function EtaIlPanel({ bookingId }: { bookingId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "prepare" | "fill") {
    setBusy(true);
    setError(null);
    setConfirmed(false);
    const res = await fetch(`/api/admin/bookings/${bookingId}/eta-il`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = (await res.json().catch(() => null)) as View | { error?: string } | null;
    setBusy(false);
    if (!res.ok || !json || !("phase" in json)) {
      setError(json && "error" in json && json.error ? json.error : "Préparation impossible");
      return;
    }
    setView(json);
  }

  return (
    <div className="space-y-3 border-t border-[#e5e3dc] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--admin-navy)]">ETA-IL</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(view?.phase === "prêt" ? "fill" : "prepare")}
          className="inline-flex h-7 items-center rounded-full bg-[var(--admin-navy)] px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "En cours…" : view?.phase === "prêt" ? "Remplir le portail" : "Préparer l’ETA-IL"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {view?.reason ? <p className="text-sm text-[var(--admin-navy)]">{view.reason}</p> : null}
      {view?.travelers.length ? (
        <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
          {view.travelers.map((row) => (
            <li key={row.travelerId}>
              <span className="font-medium">{row.name}</span>
              {row.blockedReason ? ` — ${row.blockedReason}` : ""}
              {row.missing.length ? ` — manque : ${row.missing.join(", ")}` : ""}
              {row.ready ? " — prêt" : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {view?.phase === "à confirmer" ? (
        <div className="space-y-2 rounded-2xl bg-[#f7f4ee] px-3 py-3 text-sm text-[var(--admin-navy)]">
          <p>{view.summary || "Formulaire rempli. L’envoi et le paiement ne sont pas faits."}</p>
          <p>
            Séjour {view.startDate || "—"} → {view.endDate || "—"}. Portail officiel uniquement.
          </p>
          <button
            type="button"
            onClick={() => setConfirmed(true)}
            className="inline-flex h-7 items-center rounded-full border border-[var(--admin-navy)] px-3 text-xs font-semibold"
          >
            Confirmer et ouvrir le portail
          </button>
          {confirmed ? (
            <a href={view.portal} target="_blank" rel="noreferrer" className="block font-semibold underline">
              Terminer l’envoi et le paiement sur le portail
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
