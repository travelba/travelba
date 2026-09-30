"use client";

import { calendarOpenTarget } from "@/lib/crm/calendar-ics";

export function AddToPhoneCalendar({
  href,
  webcalHref = null,
  googleHref = null,
  className,
  children,
}: {
  href: string;
  webcalHref?: string | null;
  googleHref?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    const nav = navigator;
    const appleTouch =
      /iPhone|iPad|iPod/i.test(nav.userAgent) ||
      (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
    const target = calendarOpenTarget({
      ua: nav.userAgent,
      webcalHref,
      googleHref,
      appleTouch,
    });
    if (!target || target === href) return;
    event.preventDefault();
    window.location.assign(target);
  }

  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
