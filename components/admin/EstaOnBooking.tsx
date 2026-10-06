"use client";

import { useEffect, useRef, useState } from "react";
import { adminAction } from "@/lib/crm/admin-action";
import {
  ESTA_PENDING_STALE_MS,
  ESTA_POLL_INTERVAL_MS,
  ESTA_POLL_WINDOW_MS,
  ESTA_STALE_LABEL,
  estaLineAsPending,
  estaRequestStale,
  mergeEstaPoll,
  type EstaTravelerLine,
} from "@/lib/crm/esta-status";

const TONE = {
  ok: "bg-[#0B192C] text-[#C5A880]",
  warn: "bg-[#C5A880]/25 text-[#0B192C]",
  muted: "bg-[#f4f1ea] text-[#0B192C]",
};

function readLines(value: unknown): EstaTravelerLine[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((row): row is EstaTravelerLine => {
    if (!row || typeof row !== "object") return false;
    const line = row as EstaTravelerLine;
    return typeof line.travelerId === "string" && typeof line.badge === "string" && typeof line.name === "string";
  });
}

export function EstaOnBooking({ bookingId, rows: initialRows }: { bookingId: string; rows: EstaTravelerLine[] }) {
  const [rows, setRows] = useState(initialRows);
  const [source, setSource] = useState(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollAnchor = useRef<number | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const pending = rows.some((row) => row.pending);

  if (source !== initialRows) {
    setSource(initialRows);
    setRows(mergeEstaPoll(rows, initialRows));
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await adminAction<{ lines?: unknown }>(`/api/admin/bookings/${bookingId}/esta`, { method: "GET" });
      if (cancelled || !result.ok) return;
      const lines = readLines(result.data?.lines);
      if (lines?.length) setRows((current) => mergeEstaPoll(current, lines));
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  useEffect(() => {
    if (!pending) {
      pollAnchor.current = null;
      return;
    }
    if (pollAnchor.current == null) pollAnchor.current = Date.now();
    if (Date.now() - pollAnchor.current >= ESTA_POLL_WINDOW_MS) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled || pollAnchor.current == null) return;
      if (Date.now() - pollAnchor.current >= ESTA_POLL_WINDOW_MS) return;
      const result = await adminAction<{ lines?: unknown }>(`/api/admin/bookings/${bookingId}/esta`, { method: "GET" });
      if (cancelled) return;
      const lines = result.ok ? readLines(result.data?.lines) : null;
      if (lines) setRows((current) => mergeEstaPoll(current, lines));
      if (!cancelled && pollAnchor.current != null && Date.now() - pollAnchor.current < ESTA_POLL_WINDOW_MS) {
        setPollTick((tick) => tick + 1);
      }
    }, ESTA_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pending, bookingId, pollTick]);

  useEffect(() => {
    const waiting = rows.filter((row) => row.pending && row.requestedAt && !row.stale);
    if (!waiting.length) return;
    const due = waiting.reduce((soonest, row) => {
      const at = Date.parse(row.requestedAt || "");
      if (!Number.isFinite(at)) return soonest;
      return Math.min(soonest, at + ESTA_PENDING_STALE_MS);
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(due)) return;
    const timer = window.setTimeout(() => {
      setRows((current) =>
        current.map((row) => {
          if (!row.pending || !row.requestedAt || row.stale) return row;
          if (!estaRequestStale(row.requestedAt, Date.now())) return row;
          return { ...row, stale: true, badge: ESTA_STALE_LABEL };
        })
      );
    }, Math.max(0, due - Date.now()));
    return () => window.clearTimeout(timer);
  }, [rows]);

  if (!rows.length) return null;

  async function run(travelerId: string, action: "verify" | "send") {
    const snapshot = rows;
    const requestedAt = new Date().toISOString();
    if (action === "verify") {
      setRows((current) => current.map((row) => (row.travelerId === travelerId ? estaLineAsPending(row, requestedAt) : row)));
    }
    setBusy(`${action}:${travelerId}`);
    setError(null);
    const result = await adminAction<{ lines?: unknown }>(`/api/admin/bookings/${bookingId}/esta`, {
      method: "POST",
      body: { travelerId, action },
    });
    setBusy(null);
    if (!result.ok) {
      if (action === "verify") {
        const previous = snapshot.find((row) => row.travelerId === travelerId);
        if (previous) {
          setRows((current) => current.map((row) => (row.travelerId === travelerId ? previous : row)));
        }
      }
      setError(result.error || "Impossible pour le moment.");
      return;
    }
    const lines = readLines(result.data?.lines);
    if (lines?.length) setRows((current) => mergeEstaPoll(current, lines));
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">ESTA</p>
      <ul className="space-y-2" aria-live="polite">
        {rows.map((row) => (
          <li key={row.travelerId} className="flex flex-wrap items-center justify-between gap-2" aria-busy={row.pending || undefined}>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#0B192C]">{row.name}</span>
              <span className="block text-xs text-[#5c6570]">
                {row.checkedLabel}
                {row.caption ? ` · ${row.caption}` : ""}
              </span>
            </span>
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span
                className={`rounded-full px-3 py-1 text-center text-xs font-semibold leading-snug ${TONE[row.tone]} ${row.stale ? "max-w-[16rem]" : ""}`}
              >
                {row.badge}
              </span>
              {row.canVerify ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(row.travelerId, "verify")}
                  className="admin-tap rounded-full border border-[#0B192C] px-3 py-1 text-xs font-semibold text-[#0B192C] disabled:opacity-50"
                >
                  {busy === `verify:${row.travelerId}` ? "Vérification…" : "Vérifier l’ESTA"}
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
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
