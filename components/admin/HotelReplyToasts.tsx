"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/crm/icons";
import type { HotelReplyNotice } from "@/lib/crm/hotel-reply-notice";
import { replyMoment } from "@/lib/crm/hotel-reply-when";

const STORAGE_KEY = "travelba-hotel-reply-since";
const OPEN_KEY = "travelba-hotel-reply-open";
const DISMISSED_KEY = "travelba-hotel-reply-dismissed";
const POLL_MS = 60_000;

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

function readOpen() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPEN_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isNotice) : [];
  } catch {
    return [];
  }
}

function writeOpen(notices: HotelReplyNotice[]) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(notices));
  } catch {
    // La file reste dans cet onglet.
  }
}

function readDismissed() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // Les identifiants fermés restent dans cet onglet.
  }
}

export function HotelReplyToasts() {
  const router = useRouter();
  const [queue, setQueue] = useState<HotelReplyNotice[]>([]);
  const [ready, setReady] = useState(false);
  const dismissed = useRef<Set<string>>(new Set());
  const visible = queue.slice(0, 4);

  useEffect(() => {
    if (!ready) return;
    writeOpen(queue);
  }, [queue, ready]);

  useEffect(() => {
    let stopped = false;
    dismissed.current = readDismissed();
    const kept = readOpen().filter((notice) => !dismissed.current.has(notice.id));
    setQueue(kept);
    setReady(true);
    let memorySince = readSince();

    async function tick() {
      if (stopped || document.visibilityState === "hidden") return;
      if (!memorySince) {
        memorySince = new Date().toISOString();
        writeSince(memorySince);
        return;
      }
      const since = memorySince;
      let notices: HotelReplyNotice[] = [];
      try {
        const res = await fetch(`/api/admin/hotel-replies?since=${encodeURIComponent(since)}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { notices?: HotelReplyNotice[] };
        notices = Array.isArray(json.notices) ? json.notices.filter(isNotice) : [];
      } catch {
        return;
      }
      if (stopped || !notices.length) return;
      setQueue((current) => {
        const seen = new Set(current.map((notice) => notice.id));
        const next = [...current];
        for (const notice of notices) {
          if (!notice.id || seen.has(notice.id) || dismissed.current.has(notice.id)) continue;
          seen.add(notice.id);
          next.push(notice);
        }
        return next;
      });
      const sinceMs = Date.parse(since);
      const latestMs = notices.reduce((max, notice) => {
        const at = Date.parse(notice.receivedAt);
        return Number.isFinite(at) && at > max ? at : max;
      }, sinceMs);
      if (Number.isFinite(latestMs) && latestMs > sinceMs) {
        memorySince = new Date(latestMs).toISOString();
        writeSince(memorySince);
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!visible.length) return null;

  function dismiss(id: string) {
    dismissed.current.add(id);
    writeDismissed(dismissed.current);
    setQueue((current) => current.filter((notice) => notice.id !== id));
  }

  function open(notice: HotelReplyNotice) {
    router.push(notice.href);
  }

  return (
    <HotelReplyToastStack
      notices={visible}
      waiting={Math.max(0, queue.length - visible.length)}
      onOpen={open}
      onDismiss={dismiss}
    />
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
  if (!notices.length) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[55] flex w-[min(24rem,calc(100vw-2rem))] flex-col items-end gap-2"
      aria-live="polite"
    >
      {waiting > 0 ? (
        <p className="pointer-events-none rounded-full bg-[#0B192C]/90 px-3 py-1 text-xs font-semibold text-[#C5A880] shadow-[0_8px_24px_rgba(11,25,44,0.18)]">
          {waiting === 1 ? "Encore une réponse" : `Encore ${waiting} réponses`}
        </p>
      ) : null}
      {notices.map((notice) => {
        const when = replyMoment(notice.receivedAt);
        return (
          <article
            key={notice.id}
            className="admin-toast-in pointer-events-auto flex w-full overflow-hidden rounded-2xl bg-[#0B192C] text-[#faf9f6] shadow-[0_18px_50px_rgba(11,25,44,0.32)] ring-1 ring-[#C5A880]/45"
          >
            <div className="relative min-w-0 flex-1 px-3 py-3 pr-8">
              <button
                type="button"
                className="admin-tap absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[#C5A880] hover:bg-white/10"
                aria-label={`Fermer la notification de ${notice.hotel}`}
                onClick={() => onDismiss(notice.id)}
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C5A880]/15 text-[#C5A880]">
                  <Icon name="hotel" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">L’hôtel a répondu</span>
                    {when ? <span className="shrink-0 text-[10px] font-medium text-[#faf9f6]/55">{when}</span> : null}
                  </p>
                  <p className="mt-1 truncate font-display text-[15px] font-semibold tracking-[-0.02em]">{notice.hotel}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-[#faf9f6]/78">{notice.excerpt}</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="admin-tap flex w-16 shrink-0 flex-col items-center justify-center gap-1 border-l border-[#0B192C]/10 bg-[#C5A880] px-2 text-[#0B192C]"
              aria-label={`Ouvrir la réponse de ${notice.hotel}`}
              onClick={() => onOpen(notice)}
            >
              <Icon name="arrow_forward" className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-[0.08em]">Voir</span>
            </button>
          </article>
        );
      })}
    </div>
  );
}
