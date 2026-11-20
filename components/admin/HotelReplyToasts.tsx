"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserAlertPrompt } from "@/components/admin/BrowserAlertPrompt";
import { Icon } from "@/components/crm/icons";
import {
  clearPopupOwner,
  dismissAdminNotice,
  deliverAdminNotices,
  prunePopupQueue,
  readAdminNotices,
  readDismissedNotices,
  readPopupOwner,
  suppressOsNotices,
  writePopupOwner,
} from "@/lib/crm/admin-notice-store";
import {
  asAdminNotice,
  DISMISSED_KEY,
  isPopupNotice,
  NOTICES_EVENT,
  noticeIcon,
  OPEN_KEY,
  POPUP_OWNER_KEY,
  popupCursor,
  popupWaitingLabel,
  shouldShowAdminPopup,
  takePopupBacklog,
  VISIBLE_POPUPS,
} from "@/lib/crm/admin-popup";
import type { AgencyAlert } from "@/lib/crm/agency-alerts";
import { BROWSER_ALERT_OPEN, type BrowserAlertOpenDetail } from "@/lib/crm/browser-alert";
import type { HotelReplyNotice } from "@/lib/crm/hotel-reply-notice";
import { replyMoment } from "@/lib/crm/hotel-reply-when";
import {
  LEADER_KEY,
  TAB_CHANNEL,
  leaderRecord,
  newTabId,
  parseLeaderRecord,
  shouldLead,
} from "@/lib/crm/tab-leader";

const STORAGE_KEY = "travelba-hotel-reply-since";
const POLL_MS = 180_000;

function readSince() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSince(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Le curseur en mémoire suffit pour cet onglet.
  }
}

function isNotice(value: unknown): value is HotelReplyNotice {
  if (!value || typeof value !== "object") return false;
  const notice = value as HotelReplyNotice;
  return Boolean(notice.id && notice.href && notice.hotel);
}

function isAlert(value: unknown): value is AgencyAlert {
  if (!value || typeof value !== "object") return false;
  const alert = value as AgencyAlert;
  return Boolean(alert.id && alert.href && alert.title && alert.at && alert.kicker);
}

function readLeader() {
  try {
    return parseLeaderRecord(localStorage.getItem(LEADER_KEY));
  } catch {
    return null;
  }
}

function writeLeader(id: string, now: number) {
  try {
    localStorage.setItem(LEADER_KEY, JSON.stringify(leaderRecord(id, now)));
  } catch {
    // Sans stockage partagé, chaque onglet sonde pour lui-même.
  }
}

function clearLeader(id: string) {
  try {
    if (readLeader()?.id === id) localStorage.removeItem(LEADER_KEY);
  } catch {
    // Rien à libérer.
  }
}

type TabMessage = { type: "queue" | "resign"; id?: string; since?: string } | { type: "notices"; since?: string };

/** Horloge posée au montage puis rafraîchie chaque minute ; null au rendu serveur. */
function useClock(active: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 60_000);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [active]);
  return now;
}

export function HotelReplyToasts() {
  const router = useRouter();
  const refresh = useRef(router.refresh);
  const [queue, setQueue] = useState<HotelReplyNotice[]>([]);
  const [present, setPresent] = useState(false);
  const visible = present ? queue.slice(0, VISIBLE_POPUPS) : [];

  useEffect(() => {
    refresh.current = router.refresh;
  }, [router]);

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<BrowserAlertOpenDetail>).detail;
      if (!detail?.id || !detail.href) return;
      dismissAdminNotice(detail.id);
      router.push(detail.href);
    }
    window.addEventListener(BROWSER_ALERT_OPEN, onOpen);
    return () => window.removeEventListener(BROWSER_ALERT_OPEN, onOpen);
  }, [router]);

  useEffect(() => {
    let stopped = false;
    const tabId = newTabId();
    suppressOsNotices(readAdminNotices().map((notice) => notice.id));
    prunePopupQueue();
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(TAB_CHANNEL);
    let memorySince = popupCursor(readSince(), Date.now());
    writeSince(memorySince);

    function reload() {
      const dismissed = readDismissedNotices();
      setQueue(readAdminNotices().filter((notice) => isPopupNotice(notice) && !dismissed.has(notice.id)));
    }

    function syncOwner() {
      const visibleTab = document.visibilityState === "visible";
      const focused = document.hasFocus();
      if (visibleTab && focused) writePopupOwner(tabId);
      else if (!visibleTab) clearPopupOwner(tabId);
      setPresent(
        shouldShowAdminPopup({
          selfId: tabId,
          ownerId: readPopupOwner(),
          visible: visibleTab,
          focused,
        })
      );
    }

    reload();
    syncOwner();

    // Un seul onglet sonde (A-27), y compris en arrière-plan : sinon l’écran verrouillé ne voit rien.
    async function tick() {
      if (stopped) return;
      const now = Date.now();
      if (!shouldLead(readLeader(), tabId, now)) return;
      writeLeader(tabId, now);
      const storedSince = readSince();
      if (storedSince && storedSince > memorySince) memorySince = storedSince;
      const since = memorySince;
      let notices: HotelReplyNotice[] = [];
      let alerts: AgencyAlert[] = [];
      let replied = 0;
      try {
        const res = await fetch(`/api/admin/hotel-replies?since=${encodeURIComponent(since)}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { notices?: HotelReplyNotice[]; alerts?: AgencyAlert[]; replied?: number };
        notices = Array.isArray(json.notices) ? json.notices.filter(isNotice) : [];
        alerts = Array.isArray(json.alerts) ? json.alerts.filter(isAlert) : [];
        replied = typeof json.replied === "number" ? json.replied : 0;
      } catch {
        return;
      }
      if (stopped) return;
      if (replied > 0) refresh.current();
      const incoming = [...notices, ...alerts.map(asAdminNotice)].filter(isPopupNotice);
      const shown = takePopupBacklog(incoming);
      if (shown.length) deliverAdminNotices(shown);
      const sinceMs = Date.parse(since);
      const latestMs = incoming.reduce((max, notice) => {
        const at = Date.parse(notice.receivedAt);
        return Number.isFinite(at) && at > max ? at : max;
      }, sinceMs);
      if (Number.isFinite(latestMs) && latestMs > sinceMs) {
        memorySince = new Date(latestMs).toISOString();
        writeSince(memorySince);
      }
      channel?.postMessage({ type: "queue", since: memorySince } satisfies TabMessage);
    }

    function onMessage(event: MessageEvent<TabMessage>) {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "queue" || message.type === "notices") {
        if (message.since && (!memorySince || message.since > memorySince)) memorySince = message.since;
        reload();
      } else if (message.type === "resign") {
        void tick();
      }
    }
    channel?.addEventListener("message", onMessage);
    window.addEventListener(NOTICES_EVENT, reload);

    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    const beat = window.setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        writePopupOwner(tabId);
        setPresent(true);
      }
    }, 5_000);
    const onVisible = () => {
      syncOwner();
      if (document.visibilityState === "visible") void tick();
    };
    const onLeave = () => {
      clearLeader(tabId);
      clearPopupOwner(tabId);
      channel?.postMessage({ type: "resign", id: tabId } satisfies TabMessage);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === OPEN_KEY || event.key === DISMISSED_KEY) reload();
      if (event.key === null || event.key === POPUP_OWNER_KEY) syncOwner();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", syncOwner);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("storage", onStorage);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", syncOwner);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(NOTICES_EVENT, reload);
      channel?.removeEventListener("message", onMessage);
      onLeave();
      channel?.close();
    };
  }, []);

  function dismiss(id: string) {
    dismissAdminNotice(id);
  }

  function open(notice: HotelReplyNotice) {
    dismissAdminNotice(notice.id);
    router.push(notice.href);
  }

  return (
    <>
      <BrowserAlertPrompt />
      <HotelReplyToastStack
        notices={visible}
        waiting={Math.max(0, queue.length - visible.length)}
        onOpen={open}
        onDismiss={dismiss}
      />
    </>
  );
}

export function HotelReplyToastStack({
  notices,
  waiting = 0,
  onOpen,
  onDismiss,
}: {
  notices: HotelReplyNotice[];
  waiting?: number;
  onOpen: (notice: HotelReplyNotice) => void;
  onDismiss: (id: string) => void;
}) {
  // « Il y a N min » dépend de l’horloge : calculé après le montage pour que le serveur et le client rendent la même chose (V-03).
  const now = useClock(notices.length > 0);
  if (!notices.length) return null;
  const waitingLabel = popupWaitingLabel(waiting);
  return (
    <div className="pointer-events-none fixed right-4 top-[4.5rem] z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col items-end gap-2 lg:top-20">
      <div className="pointer-events-auto flex max-h-[calc(100dvh_-_8rem)] w-full flex-col gap-2 overflow-y-auto">
        {waitingLabel ? (
          <p className="self-end rounded-full bg-[#0B192C]/90 px-3 py-1 text-xs font-semibold text-[#C5A880] shadow-[0_8px_24px_rgba(11,25,44,0.18)]">
            {waitingLabel}
          </p>
        ) : null}
        {notices.map((notice, index) => {
          const when = now == null ? "" : replyMoment(notice.receivedAt, now);
          const labelId = `admin-notice-${index}`;
          return (
            <article
              key={notice.id}
              role="dialog"
              aria-modal="false"
              aria-labelledby={labelId}
              className="admin-toast-in w-full overflow-hidden rounded-2xl bg-white text-[#0B192C] shadow-[0_18px_50px_rgba(11,25,44,0.28)] ring-1 ring-[#C5A880]"
            >
              <header className="flex items-center gap-2 bg-[#0B192C] px-3 py-2 text-[#faf9f6]">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#C5A880]/20 text-[#C5A880]">
                  <Icon name={noticeIcon(notice.kicker)} className="h-3.5 w-3.5" />
                </span>
                <p className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">
                  {notice.kicker || "L’hôtel a répondu"}
                </p>
                {when ? <span className="shrink-0 text-[10px] font-medium text-[#faf9f6]/55">{when}</span> : null}
                <button
                  type="button"
                  className="admin-tap inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#C5A880] hover:bg-white/10"
                  aria-label={`Fermer la notification : ${notice.hotel}`}
                  onClick={() => onDismiss(notice.id)}
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </header>
              <div className="px-4 py-3">
                <p id={labelId} className="font-display text-[15px] font-semibold tracking-[-0.02em]">
                  {notice.hotel}
                </p>
                <p className="mt-1 line-clamp-3 text-sm leading-snug text-[#3d4654]">{notice.excerpt}</p>
              </div>
              <div className="flex justify-end border-t border-[#e5e0d4] px-3 py-2">
                <button
                  type="button"
                  className="admin-tap rounded-full bg-[#0B192C] px-3 py-1.5 text-sm font-semibold text-[#C5A880]"
                  aria-label={`Ouvrir : ${notice.hotel}`}
                  onClick={() => onOpen(notice)}
                >
                  Ouvrir
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
