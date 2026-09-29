"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  calendarCells,
  calendarMonthLabel,
  shiftMonth,
  weekdayLabels,
} from "@/lib/crm/dates";

function localToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parts(iso: string) {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1, day: Number(match[3]) };
}

export function FrCalendar({
  open,
  anchor,
  value,
  min,
  max,
  onPick,
  onClose,
}: {
  open: boolean;
  anchor: DOMRect | null;
  value: string;
  min?: string;
  max?: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const titleId = useId().replace(/:/g, "");
  const initial = parts(value) || parts(localToday())!;
  const [cursor, setCursor] = useState({ year: initial.year, monthIndex: initial.monthIndex });
  const [synced, setSynced] = useState(value);
  if (open && value !== synced) {
    setSynced(value);
    const next = parts(value);
    if (next) setCursor({ year: next.year, monthIndex: next.monthIndex });
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const panel = document.getElementById(titleId);
      if (panel?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-fr-calendar-trigger]")) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose, titleId]);

  if (!open || !anchor || typeof document === "undefined") return null;

  const width = 292;
  const estimated = 352;
  const gap = 8;
  let top = anchor.bottom + gap;
  if (top + estimated > window.innerHeight - 8) {
    top = Math.max(8, anchor.top - gap - estimated);
  }
  let left = anchor.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;

  const today = localToday();
  const cells = calendarCells(cursor.year, cursor.monthIndex);

  function allowed(iso: string) {
    if (min && iso < min) return false;
    if (max && iso > max) return false;
    return true;
  }

  return createPortal(
    <div
      id={titleId}
      role="dialog"
      aria-label={calendarMonthLabel(cursor.year, cursor.monthIndex)}
      style={{ top, left, width }}
      className="admin-af fixed z-[80] rounded-3xl border border-[var(--border)] bg-white p-3 text-[var(--admin-navy)] shadow-[0_18px_40px_-18px_rgba(11,25,44,0.45)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="font-display text-base font-bold">{calendarMonthLabel(cursor.year, cursor.monthIndex)}</p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Mois précédent"
            onClick={() => setCursor((current) => shiftMonth(current.year, current.monthIndex, -1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--admin-navy)] hover:bg-[var(--admin-peach)]"
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            aria-label="Mois suivant"
            onClick={() => setCursor((current) => shiftMonth(current.year, current.monthIndex, 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--admin-navy)] hover:bg-[var(--admin-peach)]"
          >
            <Chevron direction="right" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {weekdayLabels().map((label) => (
          <span key={label} className="py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--admin-gold-dark)]">
            {label}
          </span>
        ))}
        {cells.map((cell) => {
          const selected = cell.iso === value;
          const isToday = cell.iso === today;
          const enabled = allowed(cell.iso);
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={!enabled}
              onClick={() => {
                onPick(cell.iso);
                onClose();
              }}
              className={`mx-auto h-9 w-9 rounded-full text-sm font-semibold ${
                selected
                  ? "bg-[var(--admin-navy)] text-white"
                  : isToday
                    ? "text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)] hover:bg-[var(--admin-peach)]"
                    : cell.outside
                      ? "text-muted/50 hover:bg-[var(--admin-peach)]"
                      : "text-[var(--admin-navy)] hover:bg-[var(--admin-peach)]"
              } disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] px-1 pt-2">
        <button
          type="button"
          onClick={() => {
            onPick("");
            onClose();
          }}
          className="rounded-full px-2 py-1 text-sm font-semibold text-muted hover:text-[var(--admin-navy)]"
        >
          Effacer
        </button>
        <button
          type="button"
          disabled={!allowed(today)}
          onClick={() => {
            onPick(today);
            onClose();
          }}
          className="rounded-full px-2 py-1 text-sm font-semibold text-[var(--admin-navy)] hover:bg-[var(--admin-peach)] disabled:opacity-30"
        >
          Aujourd’hui
        </button>
      </div>
    </div>,
    document.body
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {direction === "left" ? <path d="M15 6 9 12l6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}
