"use client";

import { useSyncExternalStore } from "react";
import { calendarClickPlan, showGoogleCalendarFallback } from "@/lib/crm/calendar-open";

function openOutside(href: string) {
  const url = new URL(href, window.location.href).href;
  const opened = window.open(url, "_blank");
  if (opened) {
    opened.opener = null;
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

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
    if (plan.action === "navigate") return;
    event.preventDefault();
    if (plan.action === "google") {
      window.location.assign(plan.url);
      return;
    }
    openOutside(plan.url);
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
