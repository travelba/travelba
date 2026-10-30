import Link from "next/link";
import { DOSSIERS_VIEW_LABELS, DOSSIERS_VIEWS, dossiersHref, type DossiersView } from "@/lib/crm/dossiers-views";
import { BookingHero } from "@/components/crm/BookingHero";
import { OwnerBadge } from "@/components/admin/OwnerBadge";
import { EmptyState } from "@/components/crm/ui";
import { listStayTitle } from "@/lib/crm/carnet";
import { formatMoney } from "@/lib/crm/money";
import {
  reservationDayMonth,
  type ReservationWeekColumn,
  type ReservationWeekEntry,
} from "@/lib/crm/reservation-week";
import { staffStayLabel } from "@/lib/crm/staff-stay";
import type { CrmBooking } from "@/lib/crm/types";

export function ReservationsViewToggle({ active, listeHref }: { active: DossiersView; listeHref: string }) {
  return (
    <div className="flex w-fit max-w-full overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-1" role="tablist" aria-label="Vues des dossiers">
      {DOSSIERS_VIEWS.map((view) => (
        <Link
          key={view}
          href={view === "liste" ? listeHref : dossiersHref(view)}
          role="tab"
          aria-selected={active === view}
          className={toggleClass(active === view)}
        >
          {DOSSIERS_VIEW_LABELS[view]}
        </Link>
      ))}
    </div>
  );
}

/** « Tous » / « Mes dossiers » : les dossiers dont le collègue connecté est en charge. */
export function MineToggle({ mine, allHref, mineHref }: { mine: boolean; allHref: string; mineHref: string }) {
  return (
    <div className="flex w-fit rounded-xl border border-[var(--border)] bg-white p-1" role="tablist" aria-label="Dossiers de qui">
      <Link href={allHref} role="tab" aria-selected={!mine} className={toggleClass(!mine)}>
        Tous
      </Link>
      <Link href={mineHref} role="tab" aria-selected={mine} className={toggleClass(mine)}>
        Mes dossiers
      </Link>
    </div>
  );
}

function toggleClass(on: boolean) {
  return `shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${on ? "bg-[var(--admin-navy)] text-white" : "text-[var(--admin-navy)]"}`;
}

export function ReservationWeek({
  columns,
  names,
  places,
  amounts,
  payerLabels = {},
  owners = {},
  covers = {},
}: {
  columns: ReservationWeekColumn<CrmBooking>[];
  names: Map<string, string>;
  places: { arrival: Record<string, string[]>; route: Record<string, string[]>; layovers?: Record<string, string[]> };
  amounts: Map<string, number>;
  payerLabels?: Record<string, string>;
  /** Prénom du collègue en charge, par dossier. */
  owners?: Record<string, string>;
  covers?: Record<string, string | null>;
}) {
  const total = columns.reduce((sum, column) => sum + column.entries.length, 0);
  if (!total) {
    return (
      <EmptyState
        title="Aucun dossier à venir"
        description="Importez les PDF d’un vrai dossier, Enregistrer, puis Montrer au client. Le carnet n’apparaît côté client qu’après ce geste."
        action={
          <Link href="/admin/reservations/nouveau" className="admin-af-btn inline-flex rounded-xl px-4 py-2.5 text-sm">
            Nouveau dossier
          </Link>
        }
      />
    );
  }

  return (
    <div className="max-w-full overflow-x-auto pb-1">
      <div className="flex w-max min-w-full snap-x snap-mandatory items-start gap-3" aria-label="Séjours par jour">
        {columns.map((column) =>
          column.entries.length ? (
            <WeekColumn key={column.id} column={column} names={names} places={places} amounts={amounts} payerLabels={payerLabels} owners={owners} covers={covers} />
          ) : (
            <FoldedDay key={column.id} column={column} />
          )
        )}
      </div>
    </div>
  );
}

function FoldedDay({ column }: { column: ReservationWeekColumn<CrmBooking> }) {
  const later = column.tone === "later";
  return (
    <section
      data-folded="true"
      aria-label={`${column.title}, aucun séjour`}
      className={`admin-af-card flex w-10 shrink-0 items-center justify-center self-start rounded-2xl py-4 ${
        later ? "bg-[var(--admin-peach)]" : ""
      }`}
    >
      <h3 className="font-display text-[11px] font-bold tracking-wide text-[var(--admin-navy)] [writing-mode:vertical-rl]">
        {column.title}
      </h3>
      <p className="sr-only">{column.subtitle}. Aucun dossier</p>
    </section>
  );
}

function WeekColumn({
  column,
  names,
  places,
  amounts,
  payerLabels,
  owners,
  covers,
}: {
  column: ReservationWeekColumn<CrmBooking>;
  names: Map<string, string>;
  places: { arrival: Record<string, string[]>; route: Record<string, string[]>; layovers?: Record<string, string[]> };
  amounts: Map<string, number>;
  payerLabels: Record<string, string>;
  owners: Record<string, string>;
  covers: Record<string, string | null>;
}) {
  const today = column.tone === "today";
  const later = column.tone === "later";
  return (
    <section
      className="admin-af-card flex max-h-[calc(100vh-12rem)] w-[min(20rem,calc(100vw-2.75rem))] shrink-0 snap-start flex-col overflow-hidden rounded-2xl lg:w-80"
      aria-labelledby={`resa-${column.id}`}
    >
      <header
        className={`shrink-0 border-b px-4 py-3 ${
          today ? "border-b-2 border-[var(--admin-gold)]" : later ? "border-[var(--border)] bg-[var(--admin-peach)]" : "border-[var(--border)]"
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 id={`resa-${column.id}`} className="font-display text-base font-bold text-[var(--admin-navy)]">
            {column.title}
          </h3>
          <span className="text-sm font-semibold text-[var(--admin-gold-dark)]">{column.entries.length}</span>
        </div>
        <p className="mt-0.5 text-xs font-semibold text-[var(--admin-gold-dark)]">{column.subtitle}</p>
      </header>
      <ul className="min-h-0 divide-y divide-border overflow-y-auto">
        {column.entries.map((entry) => (
          <li key={entry.booking.id}>
            <StayRow entry={entry} column={column} names={names} places={places} amounts={amounts} payerLabels={payerLabels} owners={owners} covers={covers} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StayRow({
  entry,
  column,
  names,
  places,
  amounts,
  payerLabels,
  owners,
  covers,
}: {
  entry: ReservationWeekEntry<CrmBooking>;
  column: ReservationWeekColumn<CrmBooking>;
  names: Map<string, string>;
  places: { arrival: Record<string, string[]>; route: Record<string, string[]>; layovers?: Record<string, string[]> };
  amounts: Map<string, number>;
  payerLabels: Record<string, string>;
  owners: Record<string, string>;
  covers: Record<string, string | null>;
}) {
  const booking = entry.booking;
  const when =
    entry.mark === "retour"
      ? "Retour"
      : entry.mark === "voyage"
        ? "En voyage"
        : column.tone === "later"
          ? reservationDayMonth(booking.start_date || "")
          : "Départ";
  return (
    <Link
      href={`/admin/reservations/${booking.id}`}
      className={`flex items-center gap-3 px-3 py-3 transition hover:bg-[var(--admin-sky)]/40 ${
        entry.unseen ? "border-l-4 border-l-[var(--admin-gold)] bg-[var(--admin-peach)]" : ""
      }`}
    >
      <BookingHero
        booking={booking}
        places={places.arrival[booking.id]}
        plain
        list
        resolvedSrc={covers[booking.id] ?? null}
        className="h-14 w-20 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-gold-dark)]">
          {booking.reference} · {when}
        </p>
        <p className="truncate font-semibold text-[var(--admin-navy)]">
          {listStayTitle(booking.title, booking.destination, places.arrival[booking.id], places.route[booking.id], places.layovers?.[booking.id])}
        </p>
        <p className="truncate text-xs text-muted">{names.get(booking.customer_id) || "Client"}</p>
        {payerLabels[booking.id] ? (
          <p className="truncate text-xs font-semibold text-[var(--admin-navy)]">{payerLabels[booking.id]}</p>
        ) : null}
        <p className="mt-1 flex flex-wrap items-center gap-2">
          <OwnerBadge name={owners[booking.id]} />
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--admin-navy)] ${entry.unseen ? "bg-white" : "bg-[var(--admin-peach)]"}`}>
            {staffStayLabel(booking)}
          </span>
          <span className="text-sm font-semibold text-[var(--admin-navy)]">
            {formatMoney(amounts.get(booking.id) ?? Number(booking.total_amount), booking.currency)}
          </span>
        </p>
      </div>
    </Link>
  );
}
