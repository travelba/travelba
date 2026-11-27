"use client";

import { useEffect, useState } from "react";
import type { TrainProgress, TrainProgressCard } from "@/lib/crm/train-progress";
import { TrainRequestDesk, type TrainDeskState } from "@/components/admin/TrainRequestDesk";

export function TrainRequestTrack({
  bookingId,
  requestId,
  preview,
  bureau,
}: {
  bookingId: string;
  requestId: string;
  preview?: TrainProgress | null;
  bureau?: TrainDeskState | null;
}) {
  const [suivi, setSuivi] = useState<TrainProgress | null>(preview || null);
  const [desk, setDesk] = useState<TrainDeskState | null>(bureau || null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void fetch(`/api/admin/bookings/${bookingId}/demande-train?demande=${encodeURIComponent(requestId)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { suivi?: TrainProgress; bureau?: TrainDeskState; error?: string } | null;
        if (cancelled) return;
        if (!response.ok || !body?.suivi) {
          setErreur(body?.error || "Le suivi n’a pas pu être lu.");
          return;
        }
        setSuivi(body.suivi);
        if (body.bureau) setDesk(body.bureau);
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
  return (
    <div className="space-y-2">
      {desk ? <TrainRequestDesk bookingId={bookingId} requestId={requestId} state={desk} preview={Boolean(preview)} /> : null}
      <TrainRequestTrackView suivi={suivi} />
    </div>
  );
}

function TrainCard({ card }: { card: TrainProgressCard }) {
  return (
    <article
      className={`flex flex-col rounded-xl bg-white px-2.5 py-2 ${card.choisi ? "ring-2 ring-[var(--admin-gold)]" : "ring-1 ring-[var(--border)]"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-wide text-muted">{card.numero || "Horaire"}</p>
        {card.choisi ? (
          <span className="rounded-full bg-[#f8f3eb] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[var(--admin-gold-dark)]">
            Choisi
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <p className="font-display text-base font-semibold leading-none tabular-nums tracking-tight text-[var(--admin-navy)]">{card.departHeure}</p>
        <p className="font-display text-base font-semibold leading-none tabular-nums tracking-tight text-[var(--admin-navy)]">{card.arriveeHeure}</p>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="h-px flex-1 bg-[var(--border)]" />
        {card.duree ? <span className="shrink-0 text-[9px] font-semibold tabular-nums text-muted">{card.duree}</span> : null}
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-[var(--admin-navy)]">
        {card.departGare}
        {card.departGare && card.arriveeGare ? <span className="mx-1 text-muted">→</span> : null}
        {card.arriveeGare}
      </p>
      {card.liaison || card.prix.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.liaison ? (
            <span className="rounded-full bg-[var(--admin-navy)] px-1.5 py-px text-[10px] font-semibold text-white">{card.liaison}</span>
          ) : null}
          {card.prix.map((chip) => (
            <span
              key={chip.label}
              className={`rounded-full px-1.5 py-px text-[10px] font-semibold text-[var(--admin-navy)] ${
                chip.label.includes("Flex") ? "bg-[#f8f3eb] ring-1 ring-[var(--admin-gold)]" : "bg-[#f3f5f7]"
              }`}
            >
              {chip.label} {chip.montant}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Leg({ titre, cartes }: { titre: string; cartes: TrainProgressCard[] }) {
  const date = cartes.find((card) => card.date)?.date;
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{titre}</h3>
        {date ? <p className="text-[11px] text-muted">{date}</p> : null}
      </div>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cartes.map((card) => (
          <TrainCard key={`${card.sens}-${card.numero}-${card.departHeure}`} card={card} />
        ))}
      </div>
    </section>
  );
}

export function TrainRequestTrackView({ suivi }: { suivi: TrainProgress }) {
  const aller = suivi.cartes.filter((card) => card.sens === "Aller");
  const retour = suivi.cartes.filter((card) => card.sens === "Retour");
  const last = suivi.etapes.length - 1;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-[var(--admin-navy)]">{suivi.maintenant}</p>
        {suivi.relance ? (
          <span className="rounded-full bg-[#eef2f6] px-2 py-0.5 text-[11px] font-semibold text-[var(--admin-navy)]">{suivi.relance.titre}</span>
        ) : suivi.branche ? (
          <span className="rounded-full bg-[#f8f3eb] px-2 py-0.5 text-[11px] font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]">
            {suivi.branche.label}
            {suivi.branche.quand ? <span className="ml-1.5 font-medium text-muted">{suivi.branche.quand}</span> : null}
          </span>
        ) : null}
      </div>
      <ol className="flex overflow-x-auto pb-1">
        {suivi.etapes.map((step, index) => {
          const past = step.state !== "apres";
          return (
            <li
              key={step.id}
              aria-current={step.state === "cours" ? "step" : undefined}
              title={step.detail ? `${step.label} · ${step.detail}` : step.label}
              className="flex min-w-[3.1rem] flex-1 flex-col items-center"
            >
              <span className="flex w-full items-center">
                <span className={`h-px flex-1 ${index === 0 ? "bg-transparent" : past || suivi.etapes[index - 1]?.state !== "apres" ? "bg-[var(--admin-navy)]/25" : "bg-[var(--border)]"}`} />
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    step.state === "cours"
                      ? "h-2.5 w-2.5 bg-[var(--admin-navy)] ring-4 ring-[var(--admin-navy)]/15"
                      : step.state === "fait"
                        ? "bg-[var(--admin-gold)]"
                        : "bg-white ring-1 ring-[var(--border)]"
                  }`}
                />
                <span className={`h-px flex-1 ${index === last ? "bg-transparent" : past ? "bg-[var(--admin-navy)]/25" : "bg-[var(--border)]"}`} />
              </span>
              <span
                className={`mt-1 px-0.5 text-center text-[9px] leading-tight ${
                  step.state === "cours" ? "font-bold text-[var(--admin-navy)]" : step.state === "fait" ? "font-medium text-[var(--admin-navy)]" : "text-muted"
                }`}
              >
                {step.court}
              </span>
              {step.quand ? <span className="mt-0.5 text-center text-[9px] tabular-nums text-muted">{step.quand}</span> : null}
            </li>
          );
        })}
      </ol>
      {suivi.message ? (
        <aside className="rounded-xl bg-white px-3 py-2 ring-1 ring-[var(--border)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold-dark)]">WhatsApp</p>
            <span className="rounded-full bg-[#eef2f6] px-2 py-0.5 text-[10px] font-semibold text-[var(--admin-navy)]">
              {suivi.relance ? "Choix" : "Accroche"}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[var(--admin-navy)]">{suivi.message.titre}</p>
          <p className="text-[11px] text-muted">{suivi.message.detail}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-snug text-[var(--admin-navy)]">{suivi.message.texte}</p>
          {suivi.relance?.combinaisons.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {suivi.relance.combinaisons.map((titre) => (
                <span key={titre} className="rounded-full bg-[var(--admin-navy)] px-2.5 py-1 text-[11px] font-semibold text-white">
                  {titre}
                </span>
              ))}
            </div>
          ) : null}
          {suivi.message.quand ? <p className="mt-2 text-xs text-muted">{suivi.message.quand}</p> : null}
        </aside>
      ) : null}
      {aller.length ? <Leg titre="Aller" cartes={aller} /> : null}
      {retour.length ? <Leg titre="Retour" cartes={retour} /> : null}
      {suivi.journal.length ? (
        <ul className="space-y-1">
          {suivi.journal.map((line) => (
            <li key={`${line.quand}-${line.texte}`} className="flex items-start gap-2 text-[11px] leading-snug text-[var(--admin-navy)]">
              {line.ia ? (
                <span className="mt-px shrink-0 rounded-full bg-[var(--admin-navy)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">IA</span>
              ) : (
                <span className="mt-px shrink-0 rounded-full bg-[#f3f5f7] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-muted">Suivi</span>
              )}
              <span>
                {line.texte}
                {line.quand ? <span className="ml-1 text-muted">{line.quand}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
