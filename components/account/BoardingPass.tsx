"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AddToPhoneCalendar } from "@/components/account/AddToPhoneCalendar";
import { BoardingPassActions } from "@/components/account/BoardingPassActions";
import type { BoardingFileLink, ClientBoardingCard } from "@/lib/crm/client-boarding-pass";
import {
  liveFlightCaption,
  liveFlightProgress,
  type LiveCaption,
  type LiveClock,
  type LiveFlight,
} from "@/lib/crm/next-flight-live";

function useTicker(nowMs: number) {
  const [now, setNow] = useState(nowMs);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function ClockPair({ clock, align }: { clock: LiveClock; align: "start" | "end" }) {
  const single = clock.revised || clock.scheduled;
  if (!clock.scheduled && !clock.revised) return null;
  const end = align === "end";
  if (!clock.revised || !clock.scheduled) {
    return <span className="text-sm font-semibold tabular-nums text-white">{single}</span>;
  }
  return (
    <span className={`flex flex-col leading-none ${end ? "items-end" : "items-start"}`}>
      <span className="text-[11px] tabular-nums text-white/45 line-through">{clock.scheduled}</span>
      <span className="mt-0.5 text-sm font-semibold tabular-nums text-[#C5A880]">{clock.revised}</span>
    </span>
  );
}

function Caption({ caption }: { caption: LiveCaption }) {
  const gold = "tabular-nums text-[#C5A880]";
  const line = "text-[14px] font-semibold leading-snug text-white";
  if (caption.kind === "countdown") {
    return (
      <p className={line}>
        <span className="whitespace-nowrap">
          Décollage dans <span className={gold}>{caption.clock}</span>
        </span>
      </p>
    );
  }
  if (caption.kind === "airborne") {
    return (
      <p className={line}>
        <span className="block">Vol en cours ·</span>
        {caption.minutes != null ? (
          <span className="block">
            Arrivée dans <span className={gold}>{caption.minutes} min</span>
          </span>
        ) : null}
      </p>
    );
  }
  if (caption.kind === "landed") {
    return (
      <p className={line}>
        {caption.clock ? (
          <span className="whitespace-nowrap">
            Atterri à <span className={gold}>{caption.clock}</span>
          </span>
        ) : (
          "Atterri"
        )}
      </p>
    );
  }
  return caption.text ? <p className={line}>{caption.text}</p> : null;
}

function Track({ progress }: { progress: number }) {
  const left = `${Math.round(progress * 1000) / 10}%`;
  return (
    <div className="relative mx-1 h-7 min-w-[4.25rem] flex-1" aria-hidden>
      <div
        className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1.35px)",
          backgroundSize: "9px 4px",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "left center",
        }}
      />
      <span
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0B192C] px-0.5 transition-[left] duration-700 ease-linear"
        style={{ left }}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] rotate-45 fill-white">
          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
      </span>
    </div>
  );
}

export function BoardingPass({
  live,
  nowMs,
  calendarHref,
  googleHref = null,
  boarding = null,
}: {
  live: LiveFlight;
  /** Heure du serveur au rendu, pour que le premier affichage ne diverge pas. */
  nowMs: number;
  calendarHref: string;
  googleHref?: string | null;
  /** Présent quand des cartes d’embarquement sont prêtes pour ce vol. */
  boarding?: {
    reference?: string;
    itemIds?: string[];
    cards?: ClientBoardingCard[];
    full?: BoardingFileLink[];
  } | null;
}) {
  const now = useTicker(nowMs);
  const caption = liveFlightCaption(live, now);
  const progress = liveFlightProgress(live, now);
  const arrivalMain = live.arrival.scheduled || live.arrival.revised;
  const label = ["Prochain vol", live.number, live.origin, live.destination].filter(Boolean).join(" ");
  const calendarClass =
    "inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#C5A880]/80 px-3.5 text-[13px] font-semibold text-[#C5A880]";
  const calendarLink =
    "text-[12px] font-semibold text-white/75 underline decoration-white/30 underline-offset-2";

  const calendar = (className: string, fallbackClassName: string) => (
    <AddToPhoneCalendar
      href={calendarHref}
      googleHref={googleHref}
      className={className}
      fallbackClassName={fallbackClassName}
    >
      Ajouter au calendrier
    </AddToPhoneCalendar>
  );

  const actions = (button: ReactNode, sheet: ReactNode) => (
    <>
      <div className="min-w-0">
        <Caption caption={caption} />
        <div className="mt-1">{calendar(calendarLink, "mt-1 block text-[11px] text-white/60 underline")}</div>
      </div>
      <div className="shrink-0">{button}</div>
      {sheet}
    </>
  );

  return (
    <section
      className="overflow-hidden rounded-3xl bg-[#0B192C] text-white shadow-[0_16px_36px_rgba(11,25,44,0.28)]"
      aria-label={label}
      data-flight-phase={caption.kind}
    >
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[13px] font-bold uppercase tracking-[0.16em]">
            {live.airline || "Vol"}
          </p>
          {live.number ? <p className="shrink-0 text-[13px] font-semibold tracking-wide">{live.number}</p> : null}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <p className="font-display text-[2rem] font-bold leading-none tracking-tight">{live.origin}</p>
          <ClockPair clock={live.departure} align="start" />
          <Track progress={progress} />
          {arrivalMain ? <span className="text-sm font-semibold tabular-nums text-white">{arrivalMain}</span> : null}
          <p className="font-display text-[2rem] font-bold leading-none tracking-tight">{live.destination}</p>
        </div>
        {live.place || live.arrivalPrevue ? (
          <div className="mt-3 flex items-start justify-between gap-3 text-[12px] leading-snug text-white/75">
            <p className="min-w-0">{live.place}</p>
            {live.arrivalPrevue ? (
              <p className="shrink-0 text-right">
                Arrivée prévue <span className="tabular-nums text-white">{live.arrivalPrevue}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/15 px-4 py-3">
        {boarding ? (
          <BoardingPassActions
            variant="home"
            reference={boarding.reference}
            itemIds={boarding.itemIds}
            cards={boarding.cards}
            full={boarding.full}
          >
            {({ button, sheet }) => actions(button, sheet)}
          </BoardingPassActions>
        ) : (
          <>
            <div className="min-w-0">
              <Caption caption={caption} />
            </div>
            <div className="shrink-0 text-right">
              {calendar(calendarClass, "mt-1 block text-right text-[11px] font-semibold text-white/70 underline")}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
