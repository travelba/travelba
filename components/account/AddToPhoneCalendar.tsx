"use client";

import type { MouseEvent, ReactNode } from "react";
import { calendarClickPlan, calendarDownloadCookie } from "@/lib/crm/calendar-open";

export function AddToPhoneCalendar({
  href,
  googleHref = null,
  className,
  children,
}: {
  href: string;
  googleHref?: string | null;
  className?: string;
  children: ReactNode;
}) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
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
    // Navigation du lien (pas de nouvelle fenêtre) : iOS ouvre Calendrier. Le cookie demande le téléchargement sur l’écran d’accueil et dans l’application.
    if (plan.forceDownload) {
      document.cookie = calendarDownloadCookie(window.location.protocol === "https:");
    }
  }

  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
