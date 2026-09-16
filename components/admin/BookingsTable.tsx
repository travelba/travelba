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
import { StatusChip, bookingStatusTone } from "@/components/crm/ui";

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
          className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--admin-navy)] focus:ring-2 focus:ring-[var(--admin-sky)]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm"
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
          <li key={b.id}>
            <Link
              href={`/admin/reservations/${b.id}`}
              className="flex flex-col gap-2 px-5 py-4 transition hover:bg-[var(--admin-sky)]/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bookingCoverUrl(b, 240)}
                  alt=""
                  className="h-12 w-16 shrink-0 rounded-xl object-cover"
                />
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
                <StatusChip tone={bookingStatusTone(b.status)}>
                  {BOOKING_STATUS_LABELS[b.status]}
                </StatusChip>
                <span className="text-sm font-semibold">
                  {formatMoney(Number(b.total_amount), b.currency)}
                </span>
              </div>
            </Link>
          </li>
        ))}
        {!filtered.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">
            Aucune réservation trouvée.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
