"use client";

import { useState } from "react";
import type { EtaIlPersonView, EtaIlPhase } from "@/lib/crm/eta-il-draft";
import { VISA_OFFICIAL, type VisaCorridor } from "@/lib/crm/visa-fees";
import {
  agencyLaunchReady,
  headerVisaLabel,
  journeyStarted,
  paymentHold,
  phaseForSavedStep,
  type ClientVisaStep,
  type EstaAnswers,
  type VisaRunPhase,
} from "@/lib/crm/visa-flow";

type View = {
  phase: EtaIlPhase | VisaRunPhase;
  portal?: string | null;
  reason: string | null;
  travelers?: EtaIlPersonView[];
  hold?: string | null;
  ceilingEur?: number;
  fee?: string;
};

const EMPTY: EstaAnswers = {
  usAddress: "",
  employment: "",
  countriesVisited: "",
  priorRefusal: "",
};

export function VisaRunPanel({
  bookingId,
  country,
  step = null,
  acceptedAt = null,
  initialAnswers = null,
  pliantReady = false,
}: {
  bookingId: string;
  country: VisaCorridor;
  step?: ClientVisaStep | null;
  acceptedAt?: string | null;
  initialAnswers?: Partial<EstaAnswers> | null;
  pliantReady?: boolean;
}) {
  const savedPhase = phaseForSavedStep(journeyStarted({ step, accepted_at: acceptedAt }) ? step : null);
  const [view, setView] = useState<View | null>(
    savedPhase
      ? {
          phase: savedPhase,
          reason: savedPhase === "paiement" ? paymentHold(pliantReady) : null,
          hold: savedPhase === "paiement" ? paymentHold(pliantReady) : null,
        }
      : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<EstaAnswers>({
    ...EMPTY,
    usAddress: initialAnswers?.usAddress || "",
    employment: initialAnswers?.employment || "",
    countriesVisited: initialAnswers?.countriesVisited || "",
    priorRefusal: initialAnswers?.priorRefusal || "",
  });
  if (!journeyStarted({ step, accepted_at: acceptedAt })) return null;
  const official = VISA_OFFICIAL[country];
  const phase = view?.phase || null;
  const recapReady = country === "IL" || agencyLaunchReady(country, answers);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/visa`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "run", country, answers }),
    });
    const json = (await res.json().catch(() => null)) as View | { error?: string } | null;
    setBusy(false);
    if (!res.ok || !json || !("phase" in json)) {
      setError(json && "error" in json && json.error ? json.error : "Préparation impossible");
      return;
    }
    setView(json);
  }

  async function fillIsrael() {
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

  async function fillRecap() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/visa`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "fill", country, answers }),
    });
    const json = (await res.json().catch(() => null)) as View | { error?: string } | null;
    setBusy(false);
    if (!res.ok || !json || !("phase" in json)) {
      setError(json && "error" in json && json.error ? json.error : "Récapitulatif impossible");
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

  function advance() {
    if (phase === "paiement" || phase === "piece") return;
    if (phase === "à confirmer") return confirm();
    if (phase === "bloqué" || (country === "IL" && (phase === "prêt" || phase === "brouillon"))) return fillIsrael();
    if (phase === "prêt") return fillRecap();
    return run();
  }

  const showAnswers = country !== "IL" && phase !== "paiement" && phase !== "piece" && phase !== "à confirmer";

  return (
    <div className="space-y-3 border-t border-[#e5e3dc] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--admin-navy)]">
          {official.countryName} · {official.amount} {official.currency}
        </p>
        <button
          type="button"
          disabled={busy || phase === "paiement" || phase === "piece" || (phase === "prêt" && !recapReady)}
          onClick={() => advance()}
          className="inline-flex h-9 items-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "En cours…" : headerVisaLabel(phase as VisaRunPhase | null, country)}
        </button>
      </div>
      {showAnswers && country === "US" ? (
        <div className="grid gap-2 text-sm">
          <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
            Adresse du séjour aux États-Unis
            <input className="rounded-xl border px-3 py-2 text-sm font-normal" value={answers.usAddress} onChange={(event) => setAnswers({ ...answers, usAddress: event.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
            Emploi
            <input className="rounded-xl border px-3 py-2 text-sm font-normal" value={answers.employment} onChange={(event) => setAnswers({ ...answers, employment: event.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
            Pays visités
            <input className="rounded-xl border px-3 py-2 text-sm font-normal" value={answers.countriesVisited} onChange={(event) => setAnswers({ ...answers, countriesVisited: event.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
            Refus de visa antérieur
            <input className="rounded-xl border px-3 py-2 text-sm font-normal" value={answers.priorRefusal} onChange={(event) => setAnswers({ ...answers, priorRefusal: event.target.value })} />
          </label>
        </div>
      ) : null}
      {showAnswers && country === "GB" ? (
        <label className="grid gap-1 text-xs font-semibold text-[var(--admin-navy)]">
          Refus de visa antérieur
          <input className="w-full rounded-xl border px-3 py-2 text-sm font-normal" value={answers.priorRefusal} onChange={(event) => setAnswers({ ...answers, priorRefusal: event.target.value })} />
        </label>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {view?.reason ? <p className="text-sm text-[var(--admin-navy)]">{view.reason}</p> : null}
      {view?.hold && view.hold !== view.reason ? <p className="text-sm text-[var(--admin-navy)]">{view.hold}</p> : null}
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
