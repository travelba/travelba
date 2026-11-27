"use client";

import { useEffect, useState } from "react";
import type { TrainProgress } from "@/lib/crm/train-progress";

export function TrainRequestTrack({
  bookingId,
  requestId,
  preview,
}: {
  bookingId: string;
  requestId: string;
  preview?: TrainProgress | null;
}) {
  const [suivi, setSuivi] = useState<TrainProgress | null>(preview || null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void fetch(`/api/admin/bookings/${bookingId}/demande-train?demande=${encodeURIComponent(requestId)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { suivi?: TrainProgress; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.suivi) {
          setErreur(body?.error || "Le suivi n’a pas pu être lu.");
          return;
        }
        setSuivi(body.suivi);
      })
      .catch(() => {
        if (!cancelled) setErreur("Le suivi n’a pas pu être lu.");
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, preview, requestId]);

  if (erreur) return <p className="text-xs font-semibold text-[var(--admin-red)]">{erreur}</p>;
  if (!suivi) return <p className="text-xs text-muted">Lecture du suivi…</p>;
  return <TrainRequestTrackView suivi={suivi} />;
}

export function TrainRequestTrackView({ suivi }: { suivi: TrainProgress }) {
  return (
    <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[#faf9f6] p-3">
      <p className="text-sm font-semibold text-[var(--admin-navy)]">{suivi.maintenant}</p>
      {suivi.branche ? (
        <p className="inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]">
          {suivi.branche.label}
          {suivi.branche.quand ? <span className="ml-2 font-semibold text-muted">{suivi.branche.quand}</span> : null}
        </p>
      ) : null}
      <ol className="space-y-1">
        {suivi.etapes.map((step) => (
          <li
            key={step.id}
            aria-current={step.state === "cours" ? "step" : undefined}
            className={`rounded-xl px-3 py-2 text-sm ${
              step.state === "cours"
                ? "bg-[var(--admin-navy)] text-white"
                : step.state === "fait"
                  ? "text-[var(--admin-navy)]"
                  : "text-muted"
            }`}
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{step.label}</span>
              {step.quand ? <span className={`shrink-0 text-xs ${step.state === "cours" ? "text-white/80" : "text-muted"}`}>{step.quand}</span> : null}
            </span>
            {step.detail ? <span className={`mt-0.5 block text-xs ${step.state === "cours" ? "text-white/80" : "text-muted"}`}>{step.detail}</span> : null}
          </li>
        ))}
      </ol>
      {suivi.trains.length ? (
        <div className="space-y-2">
          {suivi.trains.map((sens) => (
            <div key={sens.sens}>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{sens.sens}</p>
              <ul className="mt-1 space-y-1">
                {sens.lignes.map((ligne) => (
                  <li key={`${sens.sens}-${ligne.titre}`} className={`rounded-lg px-2 py-1 text-xs ${ligne.choisi ? "bg-white font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]" : "text-muted"}`}>
                    {ligne.titre}
                    {ligne.choisi ? " · choisi" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
