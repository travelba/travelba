import Link from "next/link";
import { BookingsFilters } from "@/components/admin/BookingsFilters";
import { customerFullName, type CrmBooking } from "@/lib/crm/types";
import type { CustomerNameRow } from "@/lib/crm/customer-search";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { BookingHero } from "@/components/crm/BookingHero";
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
  listHref,
  type BookingSort,
  type BookingStateFilter,
} from "@/lib/crm/admin-list";

export type BookingsListFilters = {
  q: string;
  etat: BookingStateFilter | null;
  tri: BookingSort;
};

/** Liste paginée côté serveur : la recherche met l’URL à jour pendant la saisie. */
export function BookingsTable({
  bookings,
  customers,
  places = {},
  routes = {},
  displayAmounts = {},
  page = 1,
  pageSize = ADMIN_PAGE_SIZE,
  total = bookings.length,
  filters = { q: "", etat: null, tri: "depart" },
  hiddenArchiveHits = 0,
  searchText = {},
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
  /** Texte déjà composé pour la recherche (ville, client, date, montant). */
  searchText?: Record<string, string>;
}) {
  const byId = new Map(customers.map((c) => [c.id, customerFullName(c)]));
  const urlFilters = {
    q: filters.q,
    etat: filters.etat,
    tri: filters.tri === "depart" ? null : filters.tri,
  };
  const filtering = Boolean(filters.q || filters.etat);
  const archivedOnly = filters.etat === "archive";

  return (
    <div className="mt-6 space-y-3">
      <BookingsFilters
        q={filters.q}
        etat={filters.etat}
        tri={filters.tri}
        revision={bookings.map((b) => b.id).join(",")}
      />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        label={total > 1 ? "dossiers" : "dossier"}
        hrefFor={(next) => listHref("/admin/reservations", urlFilters, next)}
      />
      <ul id="dossiers-liste" className="admin-af-card divide-y divide-border overflow-hidden rounded-2xl">
        {bookings.map((b) => (
          <li
            key={b.id}
            data-search={searchText[b.id] || ""}
            className="flex flex-col gap-3 px-5 py-4 transition hover:bg-[var(--admin-sky)]/40 sm:flex-row sm:items-center sm:justify-between"
          >
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
                <span className="text-sm font-semibold">
                  {formatMoney(displayAmounts[b.id] ?? Number(b.total_amount), b.currency)}
                </span>
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
              <DuplicateBookingButton iconOnly bookingId={b.id} label={`${b.reference} — ${b.title}`} />
              {b.archived_at ? (
                <RestoreBookingButton iconOnly bookingId={b.id} />
              ) : (
                <ArchiveBookingButton
                  iconOnly
                  redirectTo={null}
                  bookingId={b.id}
                  label={`${b.reference} — ${b.title}`}
                />
              )}
            </div>
          </li>
        ))}
        <li data-search-empty hidden className="px-5 py-8 text-center text-sm text-muted">
          Aucune réservation trouvée.
        </li>
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
