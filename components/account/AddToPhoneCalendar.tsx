"use client";

import { useSyncExternalStore } from "react";
import { calendarClickPlan, calendarDownloadCookie, showGoogleCalendarFallback } from "@/lib/crm/calendar-open";

export function AddToPhoneCalendar({
  href,
  googleHref = null,
  className,
  fallbackClassName = "text-xs font-semibold underline underline-offset-2",
  children,
}: {
  href: string;
  googleHref?: string | null;
  className?: string;
  fallbackClassName?: string;
  children: React.ReactNode;
}) {
  const googleFallback = useSyncExternalStore(
    () => () => {},
    () => showGoogleCalendarFallback({ href, googleHref, ua: navigator.userAgent }),
    () => false
  );

  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    const nav = navigator as Navigator & { standalone?: boolean };
    const plan = calendarClickPlan({
      href,
      googleHref,
      ua: navigator.userAgent,
      navigatorStandalone: nav.standalone === true,
      displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    });
    if (plan.action === "google") {
      event.preventDefault();
      window.location.assign(plan.url);
      return;
    }
    // Navigation du lien (pas de nouvelle fenêtre) : iOS ouvre Calendrier. Le cookie demande le téléchargement sur l’écran d’accueil.
    if (plan.forceDownload) {
      document.cookie = calendarDownloadCookie(window.location.protocol === "https:");
    }
  }

  return (
    <>
      <a href={href} onClick={onClick} className={className}>
        {children}
      </a>
      {googleFallback && googleHref ? (
        <a href={googleHref} target="_blank" rel="noopener noreferrer" className={fallbackClassName}>
          Google Agenda
        </a>
      ) : null}
    </>
  );
}
