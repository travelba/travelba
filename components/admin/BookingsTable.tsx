"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BOOKING_STATUS_LABELS,
  type BookingStatus,
  type CrmBooking,
} from "@/lib/crm/types";
import { customerFullName } from "@/lib/crm/types";
import type { CustomerNameRow } from "@/lib/crm/customer-search";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { BookingHero } from "@/components/crm/BookingHero";
import { StatusChip, bookingStatusTone } from "@/components/crm/ui";
import { bookingsListEmptyMessage } from "@/lib/crm/launch-status";
import { stayHeadline } from "@/lib/crm/carnet";
import {
  ArchiveBookingButton,
  DuplicateBookingButton,
  RestoreBookingButton,
} from "@/components/admin/ArchiveBookingButton";
import { staffStayLabel } from "@/lib/crm/staff-stay";

export function BookingsTable({
  bookings,
  customers,
  places = {},
  routes = {},
  displayAmounts = {},
}: {
  bookings: CrmBooking[];
  customers: CustomerNameRow[];
  places?: Record<string, string[]>;
  routes?: Record<string, string[]>;
  displayAmounts?: Record<string, number>;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const byId = useMemo(
    () => new Map(customers.map((c) => [c.id, customerFullName(c)])),
    [customers]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return bookings.filter((b) => {
      const archived = Boolean(b.archived_at);
      if (status === "archived") {
        if (!archived) return false;
      } else if (archived) {
        return false;
      } else if (status !== "all" && b.status !== status) {
        return false;
      }
      if (!needle) return true;
      const hay = `${b.reference} ${b.title} ${b.destination || ""} ${byId.get(b.customer_id) || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [bookings, byId, q, status]);

  const hiddenArchiveHits = useMemo(() => {
    if (status === "archived") return 0;
    const needle = q.trim().toLowerCase();
    if (!needle) return 0;
    return bookings.filter((b) => {
      if (!b.archived_at) return false;
      const hay = `${b.reference} ${b.title} ${b.destination || ""} ${byId.get(b.customer_id) || ""}`.toLowerCase();
      return hay.includes(needle);
    }).length;
  }, [bookings, byId, q, status]);

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Référence, destination, client…"
          className="admin-af-input w-full text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="admin-af-input text-sm sm:w-56"
        >
          <option value="all">Tous les statuts</option>
          <option value="archived">Archivées</option>
          {(Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]).map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <ul className="admin-af-card divide-y divide-border overflow-hidden rounded-2xl">
        {filtered.map((b) => (
          <li key={b.id} className="flex flex-col gap-2 px-5 py-4 transition hover:bg-[var(--admin-sky)]/40 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={`/admin/reservations/${b.id}`}
              className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
              <BookingHero
                booking={b}
                places={places[b.id]}
                plain
                className="h-16 w-28 shrink-0 rounded-xl"
              />
                <div className="min-w-0">
                  <p className="break-words font-semibold text-[var(--admin-navy)]">
                    {b.reference} · {stayHeadline(b.title, b.destination, routes[b.id] || places[b.id])}
                  </p>
                  <p className="text-xs text-muted">
                    {byId.get(b.customer_id) || "Client"} · {formatDateFr(b.start_date)} →{" "}
                    {formatDateFr(b.end_date)}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--admin-navy)]">
                  {staffStayLabel(b)}
                </span>
                <StatusChip tone={bookingStatusTone(b.status)}>
                  {BOOKING_STATUS_LABELS[b.status]}
                </StatusChip>
                <span className="text-sm font-semibold">
                  {formatMoney(displayAmounts[b.id] ?? Number(b.total_amount), b.currency)}
                </span>
              </div>
            </Link>
            <div className="flex flex-col items-end gap-1">
              <DuplicateBookingButton compact bookingId={b.id} />
              {b.archived_at ? (
                <RestoreBookingButton compact bookingId={b.id} />
              ) : (
                <ArchiveBookingButton
                  compact
                  redirectTo={null}
                  bookingId={b.id}
                  label={`${b.reference} — ${b.title}`}
                />
              )}
            </div>
          </li>
        ))}
        {!filtered.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">
            {status === "archived" ? "Aucun dossier archivé." : bookingsListEmptyMessage(bookings.length > 0)}
          </li>
        ) : null}
        {hiddenArchiveHits > 0 ? (
          <li className="px-5 py-3 text-center text-xs text-muted">
            {hiddenArchiveHits > 1
              ? `${hiddenArchiveHits} dossiers archivés correspondent. Choisissez Archivées pour les réactiver.`
              : "Un dossier archivé correspond. Choisissez Archivées pour le réactiver."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
