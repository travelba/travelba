"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminAction } from "@/lib/crm/admin-action";
import {
  UK_ETA_POLL_MS,
  UK_ETA_POLL_WINDOW_MS,
  ukEtaFeedback,
  type UkEtaTravelerLine,
} from "@/lib/crm/uk-eta-ui";

const TONE = {
  ok: "bg-[#0B192C] text-[#C5A880]",
  warn: "bg-[#C5A880]/25 text-[#0B192C]",
  muted: "bg-[#f4f1ea] text-[#0B192C]",
};

function freshRequest(row: UkEtaTravelerLine, nowMs: number) {
  if (row.status !== "a_verifier" || !row.requestedAt) return false;
  const at = Date.parse(row.requestedAt);
  return Number.isFinite(at) && nowMs - at < UK_ETA_POLL_WINDOW_MS;
}

function statusLabel(row: UkEtaTravelerLine, clicks: Record<string, string>, nowMs: number) {
  const clicked = clicks[row.travelerId];
  const checkedAfterClick = Boolean(clicked && row.checkedAt && Date.parse(row.checkedAt) > Date.parse(clicked));
  const finished = Boolean(clicked) && (row.status !== "a_verifier" || checkedAfterClick);
  const requestedAt = row.status === "a_verifier" && !finished ? clicked || row.requestedAt : null;
  return ukEtaFeedback({ status: row.status, checkedAt: row.checkedAt, requestedAt, nowMs }).label;
}

function dropFinished(clicks: Record<string, string>, lines: UkEtaTravelerLine[]) {
  const next = { ...clicks };
  let changed = false;
  for (const line of lines) {
    const clicked = next[line.travelerId];
    if (!clicked) continue;
    const done =
      line.status !== "a_verifier" || (line.checkedAt != null && Date.parse(line.checkedAt) > Date.parse(clicked));
    if (!done) continue;
    delete next[line.travelerId];
    changed = true;
  }
  return changed ? next : clicks;
}

export function UkEtaOnBooking({ bookingId, rows: initial }: { bookingId: string; rows: UkEtaTravelerLine[] }) {
  const [rows, setRows] = useState(initial);
  const [clicks, setClicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const pendingClick = useRef(false);

  const refresh = useCallback(async () => {
    const result = await adminAction<{ lines?: UkEtaTravelerLine[] }>(`/api/admin/bookings/${bookingId}/uk-eta`);
    if (!result.ok || !result.data?.lines) return;
    const lines = result.data.lines;
    setRows(lines);
    setNow(Date.now());
    setClicks((current) => {
      const next = dropFinished(current, lines);
      pendingClick.current = Object.keys(next).length > 0;
      return next;
    });
  }, [bookingId]);

  const armPoll = useCallback(() => {
    if (timer.current != null) window.clearInterval(timer.current);
    const started = Date.now();
    timer.current = window.setInterval(() => {
      if (Date.now() - started > UK_ETA_POLL_WINDOW_MS) {
        if (timer.current != null) window.clearInterval(timer.current);
        timer.current = null;
        return;
      }
      void refresh();
    }, UK_ETA_POLL_MS);
  }, [refresh]);

  useEffect(() => {
    if (pendingClick.current) return;
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const clock = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const started = Date.now();
    if (initial.some((row) => freshRequest(row, started))) armPoll();
    return () => {
      if (timer.current != null) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [armPoll, initial]);

  const run = useCallback(
    async (travelerId: string, action: "verify" | "send") => {
      if (action === "verify") {
        pendingClick.current = true;
        const stamp = new Date().toISOString();
        setClicks((current) => ({ ...current, [travelerId]: stamp }));
        setNow(Date.now());
        armPoll();
      }
      setBusy(`${action}:${travelerId}`);
      setError(null);
      const result = await adminAction<{ lines?: UkEtaTravelerLine[] }>(`/api/admin/bookings/${bookingId}/uk-eta`, {
        method: "POST",
        body: { travelerId, action },
      });
      setBusy(null);
      if (!result.ok) {
        if (action === "verify") {
          pendingClick.current = false;
          setClicks((current) => {
            if (!(travelerId in current)) return current;
            const next = { ...current };
            delete next[travelerId];
            return next;
          });
        }
        setError(result.error || "Impossible pour le moment.");
        return;
      }
      if (result.data?.lines) {
        const lines = result.data.lines;
        setRows(lines);
        setClicks((current) => {
          const next = dropFinished(current, lines);
          pendingClick.current = Object.keys(next).length > 0;
          return next;
        });
      }
    },
    [armPoll, bookingId]
  );

  if (!rows.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">ETA Royaume-Uni</p>
      <ul className="space-y-2">
        {rows.map((row) => {
          const label = now == null ? row.checkedLabel : statusLabel(row, clicks, now);
          return (
            <li key={row.travelerId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#0B192C]">{row.name}</span>
                <span className="block text-xs text-[#5c6570]" role="status">
                  {label}
                  {row.caption ? ` · ${row.caption}` : ""}
                </span>
              </span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE[row.tone]}`}>{row.badge}</span>
                {row.canVerify ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run(row.travelerId, "verify")}
                    className="admin-tap rounded-full border border-[#0B192C] px-3 py-1 text-xs font-semibold text-[#0B192C] disabled:opacity-50"
                  >
                    {busy === `verify:${row.travelerId}` ? "Vérification…" : "Vérifier l’ETA"}
                  </button>
                ) : null}
                {row.canSend ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run(row.travelerId, "send")}
                    className="admin-tap rounded-full bg-[#0B192C] px-3 py-1 text-xs font-semibold text-[#C5A880] disabled:opacity-50"
                  >
                    {busy === `send:${row.travelerId}` ? "Envoi…" : "Envoyer au client"}
                  </button>
                ) : null}
                {row.sent ? <span className="text-xs text-[#5c6570]">Envoyé au client</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
