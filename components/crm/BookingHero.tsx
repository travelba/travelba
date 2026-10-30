"use client";

import { ViewTransition, useEffect, useState, type ReactNode } from "react";
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
  priority = false,
  list = false,
  resolvedSrc = null,
  width = 960,
  plain = false,
  className = "",
  frameClassName = "relative h-60 w-full sm:h-72",
  partage = null,
  items,
  places,
  transitionName,
  children,
}: {
  booking: CoverBooking;
  width?: number;
  priority?: boolean;
  /** Liste : la page a déjà résolu la photo. Pas d’appel `/api/covers/match`. */
  list?: boolean;
  /** Photo catalogue quand le plan local est vide. `null` : rien à montrer. */
  resolvedSrc?: string | null;
  /** Vignette : photo seule, sans dégradé. */
  plain?: boolean;
  className?: string;
  frameClassName?: string;
  /** Lien public : la couverture importée passe par /api/files. */
  partage?: string | null;
  /** Cartes du séjour : deux villes → diagonale de leurs images. */
  items?: CoverPlaceItem[];
  places?: string[];
  transitionName?: string;
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
    if (list || query.length < 2) return;
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
  }, [list, query]);

  const src =
    plan.mode === "none" ? (list ? resolvedSrc : matched?.query === query ? matched.src : null) : plan.src;
  const photoWidth = plain ? 96 : width;
  const photoSizes = plain ? "112px" : "(max-width: 768px) 100vw, 960px";
  const srcB = plan.mode === "split" ? plan.srcB : null;
  const fallback = plan.mode === "single" ? plan.fallback : null;
  const place = coverQuery(booking.destination, booking.title);
  const label = place && place !== "voyage" ? place : booking.title || "Séjour";
  const showPlaceName = !src && !children;
  const alt = booking.destination || booking.title || label;

  const frame = (
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
            width={photoWidth}
            sizes={photoSizes}
          />
        ) : null}
        {srcB ? (
          <CoverPhoto
            src={srcB}
            alt=""
            className="absolute inset-0 h-full w-full origin-center scale-110 object-cover object-center [clip-path:polygon(100%_0,100%_100%,0_100%)]"
            priority={priority}
            width={photoWidth}
            sizes={photoSizes}
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

  if (!transitionName) return frame;

  return (
    <ViewTransition name={transitionName} share="account-morph" default="none">
      {frame}
    </ViewTransition>
  );
}
