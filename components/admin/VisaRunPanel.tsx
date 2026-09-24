"use client";

import { useState } from "react";
import type { EtaIlPersonView, EtaIlPhase } from "@/lib/crm/eta-il-draft";
import { VISA_OFFICIAL, type VisaCorridor } from "@/lib/crm/visa-fees";

type View = {
  phase: EtaIlPhase | "paiement";
  portal?: string | null;
  reason: string | null;
  travelers?: EtaIlPersonView[];
  hold?: string | null;
  ceilingEur?: number;
  fee?: string;
};

export function VisaRunPanel({ bookingId, country }: { bookingId: string; country: VisaCorridor }) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState({
    usAddress: "",
    employment: "",
    countriesVisited: "",
    priorRefusal: "",
  });
  const official = VISA_OFFICIAL[country];

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/visa`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "run", country }),
    });
    const json = (await res.json().catch(() => null)) as View | { error?: string } | null;
    setBusy(false);
    if (!res.ok || !json || !("phase" in json)) {
      setError(json && "error" in json && json.error ? json.error : "Préparation impossible");
      return;
    }
    setView(json);
  }

  async function fill() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/eta-il`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "fill" }),
    });
    const json = (await res.json().catch(() => null)) as View | { error?: string } | null;
    setBusy(false);
    if (!res.ok || !json || !("phase" in json)) {
      setError(json && "error" in json && json.error ? json.error : "Remplissage impossible");
      return;
    }
    setView(json);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/visa`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country, answers }),
    });
    const json = (await res.json().catch(() => null)) as View | { error?: string } | null;
    setBusy(false);
    if (!res.ok || !json || !("ceilingEur" in json || "hold" in json || "error" in json)) {
      setError(json && "error" in json && json.error ? json.error : "Confirmation impossible");
      return;
    }
    if ("error" in json && json.error) {
      setError(json.error);
      return;
    }
    setView({ ...(json as View), phase: "paiement" });
  }

  return (
    <div className="space-y-3 border-t border-[#e5e3dc] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--admin-navy)]">
          {official.countryName} · {official.amount} {official.currency}
        </p>
        <button
          type="button"
          disabled={busy || view?.phase === "paiement"}
          onClick={() => {
            if (view?.phase === "paiement") return;
            if (view?.phase === "à confirmer") return confirm();
            if (view?.phase === "prêt" && country === "IL") return fill();
            if (view?.phase === "prêt") return confirm();
            return run();
          }}
          className="inline-flex h-9 items-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? "En cours…"
            : view?.phase === "paiement"
              ? "Paiement en attente"
              : view?.phase === "à confirmer" || (view?.phase === "prêt" && country !== "IL")
                ? "Confirmer"
                : view?.phase === "prêt"
                  ? "Remplir le portail"
                  : "Lancer le parcours"}
        </button>
      </div>
      {country === "US" ? (
        <div className="grid gap-2 text-sm">
          <input className="rounded-xl border px-3 py-2" placeholder="Adresse du séjour aux États-Unis" value={answers.usAddress} onChange={(event) => setAnswers({ ...answers, usAddress: event.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="Emploi" value={answers.employment} onChange={(event) => setAnswers({ ...answers, employment: event.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="Pays visités" value={answers.countriesVisited} onChange={(event) => setAnswers({ ...answers, countriesVisited: event.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="Refus antérieur" value={answers.priorRefusal} onChange={(event) => setAnswers({ ...answers, priorRefusal: event.target.value })} />
        </div>
      ) : null}
      {country === "GB" ? (
        <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Refus antérieur" value={answers.priorRefusal} onChange={(event) => setAnswers({ ...answers, priorRefusal: event.target.value })} />
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {view?.reason ? <p className="text-sm text-[var(--admin-navy)]">{view.reason}</p> : null}
      {view?.hold ? <p className="text-sm text-[var(--admin-navy)]">{view.hold}</p> : null}
      {view?.ceilingEur ? (
        <p className="text-sm text-[var(--admin-navy)]">
          Plafond prévu {view.ceilingEur} € · dépense {view.fee}. Le débit partira au paiement.
        </p>
      ) : null}
      {view?.travelers?.length ? (
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
    </div>
  );
}
