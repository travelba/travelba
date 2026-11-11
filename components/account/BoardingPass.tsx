"use client";

import type { ReactNode } from "react";
import type { FlightPass } from "@/lib/crm/carnet";
import { AddToPhoneCalendar } from "@/components/account/AddToPhoneCalendar";
import { BoardingPassActions } from "@/components/account/BoardingPassActions";
import type { BoardingFileLink, ClientBoardingCard } from "@/lib/crm/client-boarding-pass";
import { BOARDING_PASSES_READY_LABEL } from "@/lib/crm/flight-watch";

function placeLabel(terminal: string, gate: string) {
  const terminalText = terminal ? (/^terminal\b/i.test(terminal) ? terminal : `Terminal ${terminal}`) : "";
  const gateText = gate ? (/^(porte|gate)\b/i.test(gate) ? gate : `Porte ${gate}`) : "";
  return [terminalText, gateText].filter(Boolean).join(" · ");
}

export function BoardingPass({
  pass,
  calendarHref,
  googleHref = null,
  terminal = "",
  gate = "",
  statusLabel = "",
  boarding = null,
}: {
  pass: FlightPass;
  calendarHref: string;
  googleHref?: string | null;
  terminal?: string;
  gate?: string;
  statusLabel?: string;
  /** Présent quand des cartes d’embarquement sont prêtes pour ce vol. */
  boarding?: {
    reference?: string;
    itemIds?: string[];
    cards?: ClientBoardingCard[];
    full?: BoardingFileLink[];
  } | null;
}) {
  const where = placeLabel(terminal, gate);
  const readyBadge = statusLabel === BOARDING_PASSES_READY_LABEL;
  const calendarClass = boarding
    ? "inline-flex h-11 w-full items-center justify-center rounded-full border border-white/30 px-4 text-sm font-semibold text-white"
    : "inline-flex h-11 w-full items-center justify-center rounded-full bg-[#C5A880] px-4 text-sm font-semibold text-[#0B192C]";
  const body = (badge: ReactNode, button: ReactNode, sheet: ReactNode) => (
    <section className="overflow-hidden rounded-2xl bg-[#0B192C] text-white shadow-[0_16px_36px_rgba(11,25,44,0.28)]">
      <div className="flex items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">
            Prochain vol
          </p>
          <p className="mt-1 truncate font-display text-xl font-bold">
            {pass.airline || "Vol"}
          </p>
          {pass.number ? (
            <p className="mt-1 font-display text-lg font-semibold tracking-wide text-[#C5A880]">
              {pass.number}
            </p>
          ) : null}
          {pass.airports ? <p className="mt-2 text-sm text-white/80">{pass.airports}</p> : null}
          {where ? <p className="mt-1 text-sm font-semibold text-white">{where}</p> : null}
          {badge ||
            (statusLabel ? (
              <p className="mt-2 inline-flex rounded-full bg-[#C5A880]/20 px-2.5 py-1 text-[11px] font-semibold text-[#C5A880]">
                {statusLabel}
              </p>
            ) : null)}
        </div>
        {pass.time ? (
          <p className="shrink-0 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
              Heure
            </span>
            <span className="font-display text-2xl font-bold">{pass.time}</span>
          </p>
        ) : null}
      </div>
      {button ? <div className="px-4 pb-4">{button}</div> : null}
      <div className="border-t border-dashed border-white/20 px-4 py-3">
        <AddToPhoneCalendar
          href={calendarHref}
          googleHref={googleHref}
          className={calendarClass}
          fallbackClassName="mt-2 block text-center text-xs font-semibold text-white/80 underline decoration-white/30 underline-offset-2"
        >
          Ajouter au calendrier
        </AddToPhoneCalendar>
      </div>
      {sheet}
    </section>
  );
  if (!boarding) return body(null, null, null);
  return (
    <BoardingPassActions
      variant="home"
      reference={boarding.reference}
      itemIds={boarding.itemIds}
      cards={boarding.cards}
      full={boarding.full}
      badge={readyBadge}
    >
      {({ badge, button, sheet }) => body(badge, button, sheet)}
    </BoardingPassActions>
  );
}
