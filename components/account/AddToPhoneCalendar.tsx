"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { calendarActivation, type NativeCalendarFeedback } from "@/lib/crm/calendar-native";
import { calendarDownloadCookie } from "@/lib/crm/calendar-open";
import { addStayToIosCalendar, openCalendarSettings } from "@/lib/native/calendar";
import { isIosNativeApp } from "@/lib/native/detect";

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
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<NativeCalendarFeedback | null>(null);

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const nav = navigator as Navigator & { standalone?: boolean };
    const plan = calendarActivation({
      nativeIos: isIosNativeApp(),
      href,
      googleHref,
      ua: navigator.userAgent,
      navigatorStandalone: nav.standalone === true,
      displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    });
    if ("kind" in plan) {
      event.preventDefault();
      if (pending) return;
      setPending(true);
      setFeedback(null);
      void addStayToIosCalendar(plan.href).then(
        (next) => {
          setFeedback(next);
          setPending(false);
        },
        () => {
          setFeedback({ text: "Impossible d’ajouter au calendrier.", settings: false });
          setPending(false);
        }
      );
      return;
    }
    if (plan.action === "google") {
      event.preventDefault();
      window.location.assign(plan.url);
      return;
    }
    // Navigation du lien (pas de nouvelle fenêtre) : iOS Safari ouvre Calendrier. Le cookie demande le téléchargement sur l’écran d’accueil.
    if (plan.forceDownload) {
      document.cookie = calendarDownloadCookie(window.location.protocol === "https:");
    }
  }

  return (
    <span className={feedback ? "inline-flex max-w-full flex-col items-stretch gap-1" : "contents"}>
      <a href={href} onClick={onClick} className={className} aria-busy={pending || undefined}>
        {children}
      </a>
      {feedback ? (
        <span role="status" className="text-xs font-medium text-current">
          {feedback.text}
          {feedback.settings ? (
            <>
              {" "}
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => void openCalendarSettings()}
              >
                Ouvrir les réglages
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
