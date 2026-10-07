import Link from "next/link";
import { BookingHero } from "@/components/crm/BookingHero";
import { EmptyState } from "@/components/crm/ui";
import { stayHeadline } from "@/lib/crm/carnet";
import type { DashboardWeekEntry } from "@/lib/crm/dashboard-week";
import { formatDateFr, formatMoney, jMinusLabel } from "@/lib/crm/money";
import { staffStayLabel } from "@/lib/crm/staff-stay";
import type { CrmBooking } from "@/lib/crm/types";

const GROUPS = [
  { id: "travelling", title: "En voyage" },
  { id: "soon", title: "Aujourd’hui et demain" },
  { id: "week", title: "Sous 7 jours" },
] as const;

export function DashboardWeek({
  groups,
  names,
  places,
  amounts,
}: {
  groups: {
    travelling: DashboardWeekEntry<CrmBooking>[];
    soon: DashboardWeekEntry<CrmBooking>[];
    week: DashboardWeekEntry<CrmBooking>[];
  };
  names: Map<string, string>;
  places: { arrival: Record<string, string[]>; route: Record<string, string[]> };
  amounts: Map<string, number>;
}) {
  const total = groups.travelling.length + groups.soon.length + groups.week.length;
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
    <section className="space-y-3" aria-labelledby="semaine-titre">
      <div className="flex items-center justify-between px-1">
        <h2 id="semaine-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          La semaine
        </h2>
        <Link href="/admin/reservations?etat=a-venir&tri=depart-asc" className="text-sm font-semibold text-[var(--admin-navy)]">
          Tout voir →
        </Link>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {GROUPS.map((group) => {
          const rows = groups[group.id];
          return (
            <section key={group.id} className="admin-af-card overflow-hidden rounded-2xl" aria-labelledby={`semaine-${group.id}`}>
              <h3 id={`semaine-${group.id}`} className="border-b border-[var(--border)] px-5 py-4 font-display text-base font-bold text-[var(--admin-navy)]">
                {group.title}
                {rows.length ? <span className="ml-2 text-sm font-semibold text-[#9e7e51]">{rows.length}</span> : null}
              </h3>
              {rows.length ? (
                <ul className="divide-y divide-border">
                  {rows.map((entry) => {
                    const booking = entry.booking;
                    const when = entry.mark === "retour" ? booking.end_date : booking.start_date;
                    return (
                      <li key={booking.id}>
                        <Link
                          href={`/admin/reservations/${booking.id}`}
                          className={`flex items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--admin-sky)]/40 ${
                            entry.unseen ? "border-l-4 border-l-[var(--admin-gold)] bg-[var(--admin-peach)]" : ""
                          }`}
                        >
                          <BookingHero
                            booking={booking}
                            places={places.arrival[booking.id]}
                            plain
                            className="h-14 w-20 shrink-0 rounded-xl"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9e7e51]">
                              {booking.reference}
                              {entry.mark === "retour"
                                ? " · Retour"
                                : jMinusLabel(booking.start_date)
                                  ? ` · ${jMinusLabel(booking.start_date)}`
                                  : ""}
                            </p>
                            <p className="truncate font-semibold text-[var(--admin-navy)]">
                              {stayHeadline(booking.title, booking.destination, places.route[booking.id])}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {names.get(booking.customer_id) || "Client"} · {formatDateFr(when)}
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--admin-navy)] ${
                                  entry.unseen ? "bg-white" : "bg-[var(--admin-peach)]"
                                }`}
                              >
                                {staffStayLabel(booking)}
                              </span>
                              <span className="text-sm font-semibold text-[var(--admin-navy)]">
                                {formatMoney(amounts.get(booking.id) ?? Number(booking.total_amount), booking.currency)}
                              </span>
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-muted">Aucun.</p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
