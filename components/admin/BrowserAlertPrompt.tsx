"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/crm/icons";
import {
  askBrowserAlerts,
  browserAlertBanner,
  browserAlertChoice,
  browserAlertStatus,
  browserAlertsSupported,
  readBrowserAlertMemory,
  writeBrowserAlertMemory,
  BROWSER_ALERT_CHANGE,
  type BrowserAlertChoice,
  type BrowserPermission,
} from "@/lib/crm/browser-alert";

function readPermission(): BrowserPermission {
  if (!browserAlertsSupported()) return "default";
  return Notification.permission === "granted" || Notification.permission === "denied" ? Notification.permission : "default";
}

function useBrowserAlertChoice() {
  const [choice, setChoice] = useState<BrowserAlertChoice | null>(null);
  const [memory, setMemory] = useState<string | null>(null);

  useEffect(() => {
    function read() {
      const nextMemory = readBrowserAlertMemory();
      setMemory(nextMemory);
      setChoice(
        browserAlertChoice({
          supported: browserAlertsSupported(),
          permission: readPermission(),
          memory: nextMemory,
        })
      );
    }
    read();
    window.addEventListener(BROWSER_ALERT_CHANGE, read);
    return () => window.removeEventListener(BROWSER_ALERT_CHANGE, read);
  }, []);

  return { choice, memory };
}

/** Le menu de l’avatar : activer, ou dire pourquoi le navigateur ne prévient pas. */
export function BrowserAlertMenuItem({ onDone }: { onDone: () => void }) {
  const { choice } = useBrowserAlertChoice();
  if (!choice) return null;
  const status = browserAlertStatus(choice);
  if (status.action) {
    return (
      <button
        type="button"
        role="menuitem"
        className="admin-tap flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-[var(--surface-2)]"
        onClick={() => {
          const pending = askBrowserAlerts();
          onDone();
          void pending;
        }}
      >
        <Icon name="bell" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
        {status.action}
      </button>
    );
  }
  return <p className="px-4 py-3 text-xs leading-snug text-muted">{status.note}</p>;
}

const COPY = {
  ask: {
    title: "Notifications",
    body: "Chaque alerte de l’agence s’ouvre ici. Le navigateur peut aussi l’afficher, même si cet onglet est en arrière-plan. Le choix est mémorisé sur cet appareil.",
  },
  denied: {
    title: "Notifications bloquées",
    body: "Le navigateur a refusé les notifications sur cet appareil. Autorisez-les dans ses réglages. Les alertes s’affichent quand même dans l’agence.",
  },
  unsupported: {
    title: "Notifications du système indisponibles",
    body: "Ce navigateur ne les affiche pas (par exemple Safari sur iPhone, tant que l’agence n’est pas sur l’écran d’accueil). Les alertes s’affichent quand même ici.",
  },
};

/** Bandeau volontaire. Pas de demande automatique à chaque page. */
export function BrowserAlertPrompt({ preview = false }: { preview?: boolean }) {
  const { choice, memory } = useBrowserAlertChoice();
  if (!choice) return null;
  const banner = preview ? "ask" : browserAlertBanner(choice, memory);
  if (!banner) return null;
  const copy = COPY[banner];

  return (
    <section
      className="pointer-events-auto fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-4 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white p-4 text-[#0B192C] shadow-[0_18px_50px_rgba(11,25,44,0.28)] ring-1 ring-[#C5A880] lg:bottom-[max(1rem,env(safe-area-inset-bottom))]"
      aria-label={copy.title}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B192C] text-[#C5A880]">
          <Icon name="bell" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9e7e51]">{copy.title}</p>
          <p className="mt-1 text-sm leading-snug text-[#3d4654]">{copy.body}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {banner === "ask" ? (
          <>
            <button
              type="button"
              className="admin-tap rounded-full px-3 py-1.5 text-sm font-semibold text-[#3d4654] hover:bg-[#f8f4ee]"
              onClick={() => writeBrowserAlertMemory("later")}
            >
              Plus tard
            </button>
            <button
              type="button"
              className="admin-tap rounded-full bg-[#0B192C] px-3 py-1.5 text-sm font-semibold text-[#C5A880]"
              onClick={() => void askBrowserAlerts()}
            >
              Activer les notifications
            </button>
          </>
        ) : (
          <button
            type="button"
            className="admin-tap rounded-full bg-[#0B192C] px-3 py-1.5 text-sm font-semibold text-[#C5A880]"
            onClick={() => writeBrowserAlertMemory(banner === "denied" ? "denied-seen" : "unsupported-seen")}
          >
            Compris
          </button>
        )}
      </div>
    </section>
  );
}
