"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BOOKING_STATUS_LABELS,
  type BookingStatus,
  type CrmBooking,
  type CrmCustomer,
} from "@/lib/crm/types";
import { customerFullName } from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { bookingCoverUrl } from "@/lib/crm/covers";
import { CoverPhoto } from "@/components/crm/CoverPhoto";
import { StatusChip, bookingStatusTone } from "@/components/crm/ui";
import { bookingsListEmptyMessage } from "@/lib/crm/launch-status";
import { DeleteBookingButton } from "@/components/admin/DeleteBookingButton";

export function BookingsTable({
  bookings,
  customers,
}: {
  bookings: CrmBooking[];
  customers: CrmCustomer[];
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
      if (status !== "all" && b.status !== status) return false;
      if (!needle) return true;
      const hay = `${b.reference} ${b.title} ${b.destination || ""} ${byId.get(b.customer_id) || ""}`.toLowerCase();
      return hay.includes(needle);
    });
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
              <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-xl">
                <CoverPhoto src={bookingCoverUrl(b, 240)} alt={b.destination || b.title} />
              </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--admin-navy)]">
                    {b.reference} · {b.title}
                  </p>
                  <p className="text-xs text-muted">
                    {byId.get(b.customer_id) || "Client"} · {formatDateFr(b.start_date)} →{" "}
                    {formatDateFr(b.end_date)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!b.visible_to_client ? (
                  <span className="rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--admin-navy)]">
                    Brouillon
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase text-muted">Publié</span>
                )}
                <StatusChip tone={bookingStatusTone(b.status)}>
                  {BOOKING_STATUS_LABELS[b.status]}
                </StatusChip>
                <span className="text-sm font-semibold">
                  {formatMoney(Number(b.total_amount), b.currency)}
                </span>
              </div>
            </Link>
            <DeleteBookingButton
              compact
              redirectTo={null}
              bookingId={b.id}
              label={`${b.reference} — ${b.title}`}
            />
          </li>
        ))}
        {!filtered.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">
            {bookingsListEmptyMessage(bookings.length > 0)}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
