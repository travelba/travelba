"use client";

import { calendarOpenTarget } from "@/lib/crm/calendar-ics";

export function AddToPhoneCalendar({
  href,
  googleHref = null,
  className,
  children,
}: {
  href: string;
  googleHref?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    const target = calendarOpenTarget({
      ua: navigator.userAgent,
      googleHref,
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
