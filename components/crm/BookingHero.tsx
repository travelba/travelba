"use client";

import { useEffect, useState, type ReactNode } from "react";
import { coverQuery } from "@/lib/crm/carnet";
import {
  bookingCoverPlan,
  catalogCoverUrl,
  coverGeocodeQuery,
  type CoverBooking,
  type CoverPlaceItem,
} from "@/lib/crm/covers";
import { CoverPhoto } from "@/components/crm/CoverPhoto";

export function BookingHero({
  booking,
  width = 960,
  priority = false,
  plain = false,
  className = "",
  frameClassName = "relative h-60 w-full sm:h-72",
  partage = null,
  items,
  places,
  children,
}: {
  booking: CoverBooking;
  width?: number;
  priority?: boolean;
  /** Vignette : photo seule, sans dégradé. */
  plain?: boolean;
  className?: string;
  frameClassName?: string;
  /** Lien public : la couverture importée passe par /api/files. */
  partage?: string | null;
  /** Cartes du séjour : deux villes avec photo → diagonale, sinon photo du pays. */
  items?: CoverPlaceItem[];
  places?: string[];
  children?: ReactNode;
}) {
  const plan = bookingCoverPlan(booking, {
    items,
    places,
    partage: partage || undefined,
  });
  const query = plan.mode === "none" ? coverGeocodeQuery(booking, { items, places }) : "";
  const [matched, setMatched] = useState<{ query: string; src: string | null } | null>(null);

  useEffect(() => {
    if (query.length < 2) return;
    const ctrl = new AbortController();
    let cancelled = false;
    fetch(`/api/covers/match?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { photo?: unknown } | null) => {
        if (cancelled) return;
        const photo = typeof data?.photo === "string" ? data.photo : "";
        setMatched({ query, src: photo ? catalogCoverUrl(photo) : null });
      })
      .catch(() => {
        if (!cancelled) setMatched({ query, src: null });
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [query]);

  const src = plan.mode === "none" ? (matched?.query === query ? matched.src : null) : plan.src;
  const srcB = plan.mode === "split" ? plan.srcB : null;
  const fallback = plan.mode === "single" ? plan.fallback : null;
  const place = coverQuery(booking.destination, booking.title);
  const label = place && place !== "voyage" ? place : booking.title || "Séjour";
  const showPlaceName = !src && !children;
  const alt = booking.destination || booking.title || label;

  return (
    <div className={`relative overflow-hidden bg-[var(--admin-navy)] text-white ${className}`}>
      <div className={plain ? "relative h-full w-full" : frameClassName}>
        {src ? (
          <CoverPhoto
            src={src}
            fallbackSrc={fallback}
            alt={alt}
            className={`absolute inset-0 h-full w-full origin-center scale-110 object-cover object-center ${
              srcB ? "[clip-path:polygon(0_0,100%_0,0_100%)]" : ""
            }`}
            priority={priority}
          />
        ) : null}
        {srcB ? (
          <CoverPhoto
            src={srcB}
            alt=""
            className="absolute inset-0 h-full w-full origin-center scale-110 object-cover object-center [clip-path:polygon(100%_0,100%_100%,0_100%)]"
            priority={priority}
          />
        ) : null}
        {showPlaceName ? (
          <div className="absolute inset-0 flex items-center justify-center p-1">
            <p className="text-center font-display text-[11px] font-bold leading-tight text-white">
              {label}
            </p>
          </div>
        ) : null}
        {plain ? null : (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/35 to-transparent" />
        )}
        {children ? <div className="absolute inset-0">{children}</div> : null}
      </div>
    </div>
  );
}
