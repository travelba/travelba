"use client";

import { useEffect, useRef, useState } from "react";
import { etaIlLiveFramePath, PORTAL_KIND_LABEL, type PortalLogEvent, type PortalLogKind } from "@/lib/crm/eta-il-log";

type Payload = {
  step?: string | null;
  events?: PortalLogEvent[];
  live?: boolean;
  note?: string | null;
};

function clock(at: string) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Paris",
  });
}

export function EtaIlMonitor({ bookingId }: { bookingId: string }) {
  const [events, setEvents] = useState<PortalLogEvent[]>([]);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [down, setDown] = useState(false);
  const [tick, setTick] = useState(0);
  const [frameOk, setFrameOk] = useState(false);
  const end = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch(`/api/admin/bookings/${bookingId}/eta-il`);
      if (stop) return;
      if (!res.ok) {
        setDown(true);
        return;
      }
      const json = (await res.json().catch(() => null)) as Payload | null;
      if (stop || !json) return;
      setDown(false);
      setEvents(Array.isArray(json.events) ? json.events : []);
      setLive(Boolean(json.live));
      setNote(json.note || null);
      setTick((value) => value + 1);
    }
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [bookingId]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  return (
    <div className="space-y-2 border-t border-[#e5e3dc] pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-[0.14em] text-[#9e7e51] uppercase">Suivi du portail</p>
        {live ? <p className="text-xs font-semibold text-[#9e7e51]">En direct</p> : null}
      </div>
      {down ? <p className="text-sm text-red-700">Le suivi du portail est indisponible.</p> : null}
      {note ? <p className="text-sm font-medium text-red-700">{note}</p> : null}
      {events.length ? (
        <img
          src={`/api/files?path=${encodeURIComponent(etaIlLiveFramePath(bookingId))}&inline=1&v=${tick}`}
          alt="Écran du portail ETA-IL"
          onLoad={() => setFrameOk(true)}
          onError={() => setFrameOk(false)}
          className={frameOk ? "w-full rounded-xl border border-[#e5e3dc]" : "hidden"}
        />
      ) : null}
      {events.length ? (
        <ol className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {events.map((event, index) => (
            <li key={`${event.at}-${index}`} className="flex flex-col gap-0.5 text-sm text-[var(--admin-navy)] sm:grid sm:grid-cols-[4.4rem_4.4rem_1fr] sm:gap-2">
              <time className="text-xs tabular-nums text-[#9e7e51]">{clock(event.at)}</time>
              <span className="text-xs font-semibold">{PORTAL_KIND_LABEL[event.kind as PortalLogKind] || event.kind}</span>
              <span className="min-w-0 break-words">{event.text}</span>
            </li>
          ))}
          <li ref={end} />
        </ol>
      ) : note ? null : (
        <p className="text-sm text-[var(--admin-navy)]">En attente du portail.</p>
      )}
    </div>
  );
}
