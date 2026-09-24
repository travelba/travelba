import type { ReactNode } from "react";
import { coverQuery } from "@/lib/crm/carnet";
import { bookingCoverUrl, placeCoverUrl, type CoverBooking } from "@/lib/crm/covers";
import { CoverPhoto } from "@/components/crm/CoverPhoto";

export function BookingHero({
  booking,
  width = 960,
  priority = false,
  plain = false,
  className = "",
  frameClassName = "relative h-60 w-full sm:h-72",
  children,
}: {
  booking: CoverBooking;
  width?: number;
  priority?: boolean;
  /** Vignette : photo seule, sans dégradé. */
  plain?: boolean;
  className?: string;
  frameClassName?: string;
  children?: ReactNode;
}) {
  const src = bookingCoverUrl(booking, width);
  const fallback = booking.cover_image_path ? placeCoverUrl(booking, width) : null;
  const place = coverQuery(booking.destination, booking.title);
  const label = place && place !== "voyage" ? place : booking.title || "Séjour";
  const showPlaceName = !src && !children;
  const alt = booking.destination || booking.title || label;

  return (
    <div className={`relative overflow-hidden bg-[var(--admin-navy)] text-white ${className}`}>
      <div className={plain ? "absolute inset-0" : frameClassName}>
        {src ? (
          <CoverPhoto
            src={src}
            fallbackSrc={fallback}
            alt={alt}
            className="absolute inset-0 h-full w-full origin-center scale-110 object-cover object-center"
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
