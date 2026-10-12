import Link from "next/link";
import { BookingHero } from "@/components/crm/BookingHero";
import { EmptyState } from "@/components/crm/ui";
import { stayHeadline } from "@/lib/crm/carnet";
import { dashboardDayMonth, type DashboardWeekColumn, type DashboardWeekEntry } from "@/lib/crm/dashboard-week";
import { formatMoney } from "@/lib/crm/money";
import { staffStayLabel } from "@/lib/crm/staff-stay";
import type { CrmBooking } from "@/lib/crm/types";

const LIST = {
  today: "bg-[var(--admin-navy)] text-white",
  day: "bg-[#f1f2f4] text-[var(--admin-navy)]",
  later: "bg-[#f3ecdf] text-[var(--admin-navy)]",
} as const;

export function DashboardWeek({
  columns,
  names,
  places,
  amounts,
}: {
  columns: DashboardWeekColumn<CrmBooking>[];
  names: Map<string, string>;
  places: { arrival: Record<string, string[]>; route: Record<string, string[]> };
  amounts: Map<string, number>;
}) {
  const total = columns.reduce((sum, column) => sum + column.entries.length, 0);
  if (!total) {
    return (
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">La semaine</h2>
        <EmptyState
          title="Aucun séjour cette semaine"
          description="Importez les PDF d’un vrai dossier, Enregistrer, puis Montrer au client. Le carnet n’apparaît côté client qu’après ce geste."
          action={
            <Link href="/admin/reservations/nouveau" className="admin-af-btn inline-flex rounded-xl px-4 py-2.5 text-sm">
              Nouveau dossier
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-3" aria-labelledby="semaine-titre">
      <div className="flex items-center justify-between px-1">
        <h2 id="semaine-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          La semaine
        </h2>
        <Link href="/admin/reservations?etat=a-venir" className="text-sm font-semibold text-[var(--admin-navy)]">
          Tout voir →
        </Link>
      </div>
      <div className="max-w-full overflow-x-auto pb-1">
        <div className="flex w-max items-start gap-3 rounded-2xl bg-[#e6e0d4] p-3" aria-label="Séjours par jour">
          {columns.map((column) => (
            <section
              key={column.id}
              className={`flex max-h-[calc(100vh-10rem)] w-[272px] shrink-0 flex-col rounded-xl p-2 ${LIST[column.tone]}`}
              aria-labelledby={`semaine-${column.id}`}
            >
              <header className="flex shrink-0 items-start justify-between gap-2 px-1.5 py-1.5">
                <div className="min-w-0">
                  <h3 id={`semaine-${column.id}`} className="font-display text-sm font-extrabold leading-tight">
                    {column.title}
                  </h3>
                  <p className={`mt-0.5 text-xs font-semibold ${column.tone === "today" ? "text-[var(--admin-gold)]" : "text-[#9e7e51]"}`}>
                    {column.subtitle}
                  </p>
                </div>
                <span
                  className={`grid h-[22px] min-w-[22px] place-items-center rounded-full px-1.5 text-xs font-extrabold ${
                    column.tone === "today" ? "bg-[var(--admin-gold)] text-[var(--admin-navy)]" : "bg-white text-[var(--admin-navy)]"
                  }`}
                >
                  {column.entries.length}
                </span>
              </header>
              <div className="min-h-0 overflow-y-auto">
                {column.entries.length ? (
                  <ul className="space-y-2">
                    {column.entries.map((entry) => (
                      <li key={entry.booking.id}>
                        <StayCard entry={entry} column={column} names={names} places={places} amounts={amounts} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`px-1.5 pb-1 text-xs font-semibold ${column.tone === "today" ? "text-white/70" : "text-[#97a0af]"}`}>
                    Aucun séjour
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

function StayCard({
  entry,
  column,
  names,
  places,
  amounts,
}: {
  entry: DashboardWeekEntry<CrmBooking>;
  column: DashboardWeekColumn<CrmBooking>;
  names: Map<string, string>;
  places: { arrival: Record<string, string[]>; route: Record<string, string[]> };
  amounts: Map<string, number>;
}) {
  const booking = entry.booking;
  const when = entry.mark === "retour" ? "Retour" : entry.mark === "voyage" ? "En voyage" : column.tone === "later" ? dashboardDayMonth(booking.start_date || "") : "Départ";
  return (
    <Link
      href={`/admin/reservations/${booking.id}`}
      className={`block overflow-hidden rounded-lg bg-white text-[var(--admin-navy)] shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)] ${
        entry.unseen ? "border-l-4 border-l-[var(--admin-gold)]" : ""
      }`}
    >
      <BookingHero booking={booking} places={places.arrival[booking.id]} plain className="h-[84px] w-full" />
      <div className="px-2.5 py-2">
        <div className="mb-1.5 flex gap-1" aria-hidden="true">
          {entry.mark ? <span className="h-2 w-10 rounded bg-[var(--admin-navy)]" /> : null}
          {entry.mark === "retour" || entry.unseen || !entry.mark ? <span className="h-2 w-10 rounded bg-[var(--admin-gold)]" /> : null}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9e7e51]">{booking.reference}</p>
        <p className="mt-0.5 text-sm font-extrabold leading-snug">
          {stayHeadline(booking.title, booking.destination, places.route[booking.id])}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-[#5e6c84]">
          {names.get(booking.customer_id) || "Client"} · {when}
        </p>
        <p className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-bold">{staffStayLabel(booking)}</span>
          <span className="shrink-0 text-xs font-extrabold">
            {formatMoney(amounts.get(booking.id) ?? Number(booking.total_amount), booking.currency)}
          </span>
        </p>
      </div>
    </Link>
  );
}
