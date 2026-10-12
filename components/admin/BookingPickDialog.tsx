"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/crm/icons";
import { filterBookingChoices } from "@/lib/crm/revolut-debit";
import { useIsClient } from "@/lib/crm/use-is-client";

export type RevolutBookingChoice = {
  id: string;
  reference: string;
  label: string;
  status: string;
};

export function BookingPickDialog({
  open,
  customerId,
  selectedId = "",
  onSelect,
  onClose,
}: {
  open: boolean;
  customerId: string;
  selectedId?: string;
  onSelect: (booking: RevolutBookingChoice) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RevolutBookingChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useIsClient();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setRows([]);
      setFailed(false);
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!open || !customerId) return;
    let cancelled = false;
    fetch(`/api/admin/revolut/bookings?customer_id=${encodeURIComponent(customerId)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { bookings?: RevolutBookingChoice[] };
        if (!res.ok || !Array.isArray(json.bookings)) throw new Error("load");
        if (!cancelled) setRows(json.bookings);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, customerId]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => filterBookingChoices(rows, query), [rows, query]);
  const first = shown[0] || null;

  if (!open || !mounted) return null;

  function pick(booking: RevolutBookingChoice) {
    onSelect(booking);
    onCloseRef.current();
  }

  return createPortal(
    <div
      className="admin-portal fixed inset-0 z-50 flex items-end justify-center bg-[#0b192c]/55 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#e8e4dc] bg-white text-[#1a1c1a] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e8e4dc] bg-[#faf9f6] px-5 py-4">
          <div>
            <p id={titleId} className="font-display text-lg font-bold text-[#0b192c]">
              Choisir la réservation
            </p>
            <p className="mt-0.5 text-sm text-[#44474c]">Référence, ville ou titre du dossier.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[#0b192c] hover:bg-[#f3f1ea]"
            aria-label="Fermer"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-[#e8e4dc] bg-white px-5 py-4">
          <label className="sr-only" htmlFor={`${titleId}-q`}>
            Rechercher une réservation
          </label>
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#44474c]"
            />
            <input
              id={`${titleId}-q`}
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && first) {
                  event.preventDefault();
                  pick(first);
                }
              }}
              placeholder="Rechercher une réservation…"
              className="admin-af-input w-full text-sm text-[#0b192c] placeholder:text-[#5c6370]"
              style={{ paddingLeft: "2.75rem", backgroundColor: "#f3f1ea", color: "#0b192c" }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-2 py-2">
          {loading ? (
            <p className="px-3 py-8 text-center text-sm text-[#44474c]">Chargement des réservations…</p>
          ) : failed ? (
            <p className="px-3 py-8 text-center text-sm text-[#44474c]">
              Réservations indisponibles. Fermez et réessayez.
            </p>
          ) : !rows.length ? (
            <p className="px-3 py-8 text-center text-sm text-[#44474c]">Ce client n’a pas de réservation.</p>
          ) : !shown.length ? (
            <p className="px-3 py-8 text-center text-sm text-[#44474c]">Aucun dossier pour cette recherche.</p>
          ) : (
            <ul>
              {shown.map((booking) => {
                const selected = booking.id === selectedId;
                return (
                  <li key={booking.id}>
                    <button
                      type="button"
                      onClick={() => pick(booking)}
                      className={`flex w-full flex-col rounded-2xl px-3 py-2.5 text-left transition ${
                        selected ? "bg-[#f3f1ea] ring-1 ring-[#c5a880]" : "hover:bg-[#f3f1ea]"
                      }`}
                    >
                      <span className="text-[15px] font-semibold leading-tight text-[#0b192c]">
                        {booking.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
