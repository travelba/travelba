"use client";

import { useEffect, useState } from "react";
import { AgencyLogo } from "@/components/AgencyLogo";
import { HOTEL_WAIT_LINES, hotelWaitLine } from "@/lib/crm/hotel-wait";

/** Attente hôtel : l’animation et les phrases restent dans la page, aucun appel. */
export function HotelWait({
  place,
  detail,
  quiet = false,
  hold = false,
}: {
  place?: string;
  detail?: string;
  /** Sous le titre déjà affiché, sans prendre toute la page. */
  quiet?: boolean;
  /** Réservation en cours : on demande de rester. */
  hold?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let alive = true;
    let fade = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = window.setInterval(() => {
      if (reduce) {
        setIndex((current) => current + 1);
        return;
      }
      setVisible(false);
      fade = window.setTimeout(() => {
        if (!alive) return;
        setIndex((current) => current + 1);
        setVisible(true);
      }, 420);
    }, 3600);
    return () => {
      alive = false;
      window.clearInterval(step);
      window.clearTimeout(fade);
    };
  }, []);

  const line = hotelWaitLine(index);
  const reel = [...HOTEL_WAIT_LINES, ...HOTEL_WAIT_LINES];

  if (quiet) {
    return (
      <div className="px-1 py-6 text-center" data-hotel-wait="1" role="status" aria-live="polite">
        <span className="h-wait-ring" aria-hidden="true">
          <span />
        </span>
        <p
          className="h-wait-copy h-serif mt-5 max-w-[18rem] text-[1.15rem] font-semibold leading-snug h-ink"
          style={{ opacity: visible ? 1 : 0 }}
          data-hotel-wait-line={line}
        >
          {line}
        </p>
      </div>
    );
  }

  return (
    <div className="h-wait-screen" data-hotel-wait="1" role="status" aria-live="polite">
      <AgencyLogo className="h-32 w-32" alt="" />
      {place ? <p className="h-serif mt-6 text-[1.35rem] font-semibold leading-tight text-[#f7f4ee]">{place}</p> : null}
      {detail ? <p className={`text-sm text-white/70 ${place ? "mt-1" : "mt-6"}`}>{detail}</p> : null}
      <div className="h-wait-reel" aria-hidden="true">
        <div className="h-wait-track">
          {reel.map((phrase, slot) => (
            <p key={`${phrase}-${slot}`} className="h-wait-slot">{phrase}</p>
          ))}
        </div>
      </div>
      <p className="h-wait-still" style={{ opacity: visible ? 1 : 0 }} data-hotel-wait-line={line}>
        {line}
      </p>
      {hold ? <p className="mt-6 text-sm leading-relaxed text-white/70">Ne fermez pas cette page.</p> : null}
    </div>
  );
}
