import Link from "next/link";
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
import { Pagination } from "@/components/admin/Pagination";
import {
  ADMIN_PAGE_SIZE,
  BOOKING_SORTS,
  listHref,
  type BookingSort,
  type BookingStateFilter,
} from "@/lib/crm/admin-list";

const STATE_LABELS: Record<BookingStateFilter, string> = {
  preparation: "En préparation",
  montre: "Montrés au client",
  archive: "Archivés",
};

export type BookingsListFilters = {
  q: string;
  etat: BookingStateFilter | null;
  statut: BookingStatus | null;
  tri: BookingSort;
};

/** Liste paginée côté serveur : les filtres vivent dans l’URL (formulaire GET). */
export function BookingsTable({
  bookings,
  customers,
  places = {},
  routes = {},
  displayAmounts = {},
  page = 1,
  pageSize = ADMIN_PAGE_SIZE,
  total = bookings.length,
  filters = { q: "", etat: null, statut: null, tri: "depart" },
  hiddenArchiveHits = 0,
}: {
  bookings: CrmBooking[];
  customers: CustomerNameRow[];
  places?: Record<string, string[]>;
  routes?: Record<string, string[]>;
  displayAmounts?: Record<string, number>;
  page?: number;
  pageSize?: number;
  total?: number;
  filters?: BookingsListFilters;
  hiddenArchiveHits?: number;
}) {
  const byId = new Map(customers.map((c) => [c.id, customerFullName(c)]));
  const urlFilters = {
    q: filters.q,
    etat: filters.etat,
    statut: filters.statut,
    tri: filters.tri === "depart" ? null : filters.tri,
  };
  const filtering = Boolean(filters.q || filters.etat || filters.statut);
  const archivedOnly = filters.etat === "archive";

  return (
    <div className="mt-6 space-y-3">
      <form method="get" action="/admin/reservations" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="search">
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Référence, destination, titre, client…"
          aria-label="Rechercher un dossier"
          className="admin-af-input w-full text-sm sm:flex-1"
        />
        <select name="etat" defaultValue={filters.etat || ""} aria-label="État du dossier" className="admin-af-input text-sm sm:w-48">
          <option value="">Tous les états</option>
          {(Object.keys(STATE_LABELS) as BookingStateFilter[]).map((state) => (
            <option key={state} value={state}>
              {STATE_LABELS[state]}
            </option>
          ))}
        </select>
        <select name="statut" defaultValue={filters.statut || ""} aria-label="Statut métier" className="admin-af-input text-sm sm:w-48">
          <option value="">Tous les statuts</option>
          {(Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]).map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="tri" defaultValue={filters.tri} aria-label="Tri" className="admin-af-input text-sm sm:w-56">
          {(Object.keys(BOOKING_SORTS) as BookingSort[]).map((sort) => (
            <option key={sort} value={sort}>
              {BOOKING_SORTS[sort].label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button type="submit" className="admin-af-btn admin-tap rounded-lg px-4 text-sm">
            Filtrer
          </button>
          {filtering || filters.tri !== "depart" ? (
            <Link
              href="/admin/reservations"
              className="admin-tap inline-flex items-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Effacer
            </Link>
          ) : null}
        </div>
      </form>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        label={total > 1 ? "dossiers" : "dossier"}
        hrefFor={(next) => listHref("/admin/reservations", urlFilters, next)}
      />
      <ul className="admin-af-card divide-y divide-border overflow-hidden rounded-2xl">
        {bookings.map((b) => (
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
        {!bookings.length ? (
          <li className="px-5 py-8 text-center text-sm text-muted">
            {archivedOnly
              ? "Aucun dossier archivé."
              : filtering
                ? "Aucune réservation trouvée."
                : bookingsListEmptyMessage(total > 0)}
          </li>
        ) : null}
        {hiddenArchiveHits > 0 ? (
          <li className="px-5 py-3 text-center text-xs text-muted">
            <Link href={listHref("/admin/reservations", { ...urlFilters, etat: "archive" })} className="underline">
              {hiddenArchiveHits > 1
                ? `${hiddenArchiveHits} dossiers archivés correspondent. Voir les archivés pour les réactiver.`
                : "Un dossier archivé correspond. Voir les archivés pour le réactiver."}
            </Link>
          </li>
        ) : null}
      </ul>
      {total > pageSize ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          label={total > 1 ? "dossiers" : "dossier"}
          hrefFor={(next) => listHref("/admin/reservations", urlFilters, next)}
        />
      ) : null}
    </div>
  );
}
