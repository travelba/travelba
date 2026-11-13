"use client";

import { useEffect, useState } from "react";
import { hotelWaitLine } from "@/lib/crm/hotel-wait";

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

  return (
    <div
      className={quiet ? "px-1 py-6 text-center" : "flex min-h-[52vh] flex-col items-center justify-center px-8 py-10 text-center"}
      data-hotel-wait="1"
      role="status"
      aria-live="polite"
    >
      <span className="h-wait-ring" aria-hidden="true">
        <span />
      </span>
      {place ? <p className="h-serif mt-6 text-[1.35rem] font-semibold leading-tight h-ink">{place}</p> : null}
      {detail ? <p className={`text-sm h-muted ${place ? "mt-1" : "mt-6"}`}>{detail}</p> : null}
      <p
        className="h-wait-copy h-serif mt-5 max-w-[18rem] text-[1.15rem] font-semibold leading-snug h-ink"
        style={{ opacity: visible ? 1 : 0 }}
        data-hotel-wait-line={hotelWaitLine(index)}
      >
        {hotelWaitLine(index)}
      </p>
      {hold ? <p className="mt-4 text-sm leading-relaxed h-muted">Ne fermez pas cette page.</p> : null}
    </div>
  );
}
