import { addIsoDays } from "./dates";

export type ReservationWeekBooking = {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
  visible_to_client?: boolean | null;
  status?: string | null;
  archived_at?: string | null;
};

export type ReservationWeekTone = "today" | "day" | "later";

export type ReservationWeekEntry<T extends ReservationWeekBooking = ReservationWeekBooking> = {
  booking: T;
  column: string;
  /** Séjour déjà commencé : retour le jour même, ou encore en voyage. */
  mark: "retour" | "voyage" | null;
  /** Départ dans les 7 jours, carnet pas encore visible. */
  unseen: boolean;
};

export type ReservationWeekColumn<T extends ReservationWeekBooking = ReservationWeekBooking> = {
  id: string;
  title: string;
  subtitle: string;
  tone: ReservationWeekTone;
  entries: ReservationWeekEntry<T>[];
};

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const WEEKDAY_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."] as const;
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."] as const;

function dayOf(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

function parts(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, dow };
}

function capital(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** « 12 oct. » */
export function reservationDayMonth(iso: string) {
  const { day, month } = parts(iso);
  return `${day} ${MONTHS[month - 1] || ""}`.trim();
}

function weekdayTitle(iso: string) {
  return capital(WEEKDAYS[parts(iso).dow] || "");
}

function daysUntilSunday(iso: string) {
  const dow = parts(iso).dow;
  return dow === 0 ? 0 : 7 - dow;
}

function rangeLabel(start: string, end: string) {
  const a = parts(start);
  const b = parts(end);
  if (a.month === b.month) return `${a.day}–${b.day} ${MONTHS[a.month - 1]}`;
  return `${reservationDayMonth(start)} – ${reservationDayMonth(end)}`;
}

/**
 * Onglet Réservations : une colonne par jour jusqu’à dimanche,
 * puis la semaine suivante, puis le reste. Un séjour n’apparaît qu’une fois.
 * Un séjour déjà parti est dans Aujourd’hui.
 */
export function reservationWeek<T extends ReservationWeekBooking>(bookings: T[], today: string): ReservationWeekColumn<T>[] {
  const todayDay = dayOf(today) || today;
  const sunday = addIsoDays(todayDay, daysUntilSunday(todayDay));
  const nextStart = addIsoDays(sunday, 1);
  const nextEnd = addIsoDays(nextStart, 6);
  const horizon = addIsoDays(todayDay, 7);
  const dayIds: string[] = [];
  for (let offset = 0; ; offset += 1) {
    const iso = addIsoDays(todayDay, offset);
    dayIds.push(iso);
    if (iso === sunday) break;
  }

  const byDay = new Map<string, ReservationWeekEntry<T>[]>(dayIds.map((iso) => [iso, []]));
  const next: ReservationWeekEntry<T>[] = [];
  const later: ReservationWeekEntry<T>[] = [];
  const seen = new Set<string>();

  for (const booking of bookings) {
    if (seen.has(booking.id)) continue;
    if (booking.archived_at || booking.status === "cancelled") continue;
    const start = dayOf(booking.start_date);
    const end = dayOf(booking.end_date);
    if (end && end < todayDay) continue;
    seen.add(booking.id);
    const unseen = Boolean(start && start >= todayDay && start <= horizon && !booking.visible_to_client);
    if (start && start < todayDay) {
      byDay.get(todayDay)?.push({
        booking,
        column: todayDay,
        mark: end === todayDay ? "retour" : "voyage",
        unseen: false,
      });
      continue;
    }
    if (!start) continue;
    const day = byDay.get(start);
    if (day) {
      day.push({ booking, column: start, mark: null, unseen });
      continue;
    }
    if (start >= nextStart && start <= nextEnd) {
      next.push({ booking, column: "next", mark: null, unseen });
      continue;
    }
    if (start > nextEnd) later.push({ booking, column: "later", mark: null, unseen });
  }

  const byStart = (a: ReservationWeekEntry<T>, b: ReservationWeekEntry<T>) =>
    dayOf(a.booking.start_date).localeCompare(dayOf(b.booking.start_date)) || a.booking.id.localeCompare(b.booking.id);
  const byTravel = (a: ReservationWeekEntry<T>, b: ReservationWeekEntry<T>) => {
    const rank = (entry: ReservationWeekEntry<T>) => (entry.mark ? 0 : 1);
    const gap = rank(a) - rank(b);
    if (gap) return gap;
    if (a.mark && b.mark) {
      return (
        (dayOf(a.booking.end_date) || "9999-99-99").localeCompare(dayOf(b.booking.end_date) || "9999-99-99") ||
        a.booking.id.localeCompare(b.booking.id)
      );
    }
    return byStart(a, b);
  };

  for (const [iso, entries] of byDay) {
    entries.sort(iso === todayDay ? byTravel : byStart);
  }
  next.sort(byStart);
  later.sort(byStart);

  const columns: ReservationWeekColumn<T>[] = dayIds.map((iso, index) => ({
    id: iso,
    title: index === 0 ? "Aujourd’hui" : weekdayTitle(iso),
    subtitle: index === 0 ? `${WEEKDAY_SHORT[parts(iso).dow]} ${reservationDayMonth(iso)}` : `J+${index}`,
    tone: index === 0 ? "today" : "day",
    entries: byDay.get(iso) || [],
  }));
  columns.push({
    id: "next",
    title: "Semaine pro",
    subtitle: rangeLabel(nextStart, nextEnd),
    tone: "later",
    entries: next,
  });
  columns.push({
    id: "later",
    title: "Plus tard",
    subtitle: `après le ${reservationDayMonth(nextEnd)}`,
    tone: "later",
    entries: later,
  });
  return columns;
}
