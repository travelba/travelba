"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/crm/icons";
import type { HotelReplyNotice } from "@/lib/crm/hotel-reply-notice";

const STORAGE_KEY = "travelba-hotel-reply-since";
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

export function HotelReplyToasts() {
  const router = useRouter();
  const [queue, setQueue] = useState<HotelReplyNotice[]>([]);
  const visible = queue.slice(0, 4);

  useEffect(() => {
    let stopped = false;
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
        notices = Array.isArray(json.notices) ? json.notices : [];
      } catch {
        return;
      }
      if (stopped || !notices.length) return;
      setQueue((current) => {
        const seen = new Set(current.map((notice) => notice.id));
        const next = [...current];
        for (const notice of notices) {
          if (!notice?.id || seen.has(notice.id)) continue;
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
    setQueue((current) => current.filter((notice) => notice.id !== id));
  }

  function open(notice: HotelReplyNotice) {
    dismiss(notice.id);
    router.push(notice.href);
  }

  return <HotelReplyToastStack notices={visible} onOpen={open} onDismiss={dismiss} />;
}

function HotelReplyToastStack({
  notices,
  onOpen,
  onDismiss,
}: {
  notices: HotelReplyNotice[];
  onOpen: (notice: HotelReplyNotice) => void;
  onDismiss: (id: string) => void;
}) {
  if (!notices.length) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[55] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {notices.map((notice) => (
        <article
          key={notice.id}
          className="pointer-events-auto flex items-stretch overflow-hidden rounded-2xl border border-[#C5A880]/50 bg-[#0B192C] text-[#faf9f6] shadow-[0_12px_40px_rgba(11,25,44,0.28)]"
        >
          <button
            type="button"
            className="min-w-0 flex-1 border-l-4 border-[#C5A880] px-3 py-3 text-left"
            onClick={() => onOpen(notice)}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">L’hôtel a répondu</p>
            <p className="mt-1 truncate text-sm font-semibold">{notice.hotel}</p>
            <p className="mt-1 line-clamp-2 text-sm text-[#faf9f6]/80">{notice.excerpt}</p>
          </button>
          <button
            type="button"
            className="admin-tap px-3 text-[#C5A880]"
            aria-label={`Fermer la notification de ${notice.hotel}`}
            onClick={() => onDismiss(notice.id)}
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </article>
      ))}
    </div>
  );
}
