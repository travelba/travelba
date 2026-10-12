import { addIsoDays } from "./dates";

export type DashboardWeekBooking = {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
  visible_to_client?: boolean | null;
  status?: string | null;
  archived_at?: string | null;
};

export type DashboardWeekGroupId = "travelling" | "soon" | "week";

export type DashboardWeekEntry<T extends DashboardWeekBooking = DashboardWeekBooking> = {
  booking: T;
  group: DashboardWeekGroupId;
  /** Retour le jour même, pour un séjour déjà commencé. */
  mark: "retour" | null;
  /** Départ dans les 7 jours, carnet pas encore visible. */
  unseen: boolean;
};

function dayOf(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

/**
 * Briefing de la semaine : en voyage (départ passé, retour pas passé),
 * aujourd’hui et demain, puis le reste des 7 jours. Un séjour n’apparaît qu’une fois.
 */
export function dashboardWeek<T extends DashboardWeekBooking>(bookings: T[], today: string) {
  const todayDay = dayOf(today) || today;
  const tomorrow = addIsoDays(todayDay, 1);
  const horizon = addIsoDays(todayDay, 7);
  const seen = new Set<string>();
  const travelling: DashboardWeekEntry<T>[] = [];
  const soon: DashboardWeekEntry<T>[] = [];
  const week: DashboardWeekEntry<T>[] = [];

  for (const booking of bookings) {
    if (seen.has(booking.id)) continue;
    if (booking.archived_at || booking.status === "cancelled") continue;
    const start = dayOf(booking.start_date);
    const end = dayOf(booking.end_date);
    if (end && end < todayDay) continue;
    seen.add(booking.id);
    const unseen = Boolean(start && start >= todayDay && start <= horizon && !booking.visible_to_client);
    if (start && start < todayDay) {
      travelling.push({
        booking,
        group: "travelling",
        mark: end === todayDay ? "retour" : null,
        unseen: false,
      });
      continue;
    }
    if (start === todayDay || start === tomorrow) {
      soon.push({ booking, group: "soon", mark: null, unseen });
      continue;
    }
    if (start && start > tomorrow && start <= horizon) {
      week.push({ booking, group: "week", mark: null, unseen });
    }
  }

  const byStart = (a: DashboardWeekEntry<T>, b: DashboardWeekEntry<T>) =>
    dayOf(a.booking.start_date).localeCompare(dayOf(b.booking.start_date)) || a.booking.id.localeCompare(b.booking.id);
  travelling.sort(
    (a, b) =>
      (dayOf(a.booking.end_date) || "9999-99-99").localeCompare(dayOf(b.booking.end_date) || "9999-99-99") ||
      a.booking.id.localeCompare(b.booking.id)
  );
  soon.sort(byStart);
  week.sort(byStart);
  return { travelling, soon, week };
}
