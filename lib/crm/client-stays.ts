import { stayDatesOpen, stayToday } from "@/lib/crm/stay-moment";

type Stay = { end_date: string | null; status: string };

/** À venir : le retour n’est pas passé, et le séjour n’est pas annulé. */
export function isClientUpcomingStay(booking: Stay) {
  return booking.status !== "cancelled" && stayDatesOpen(booking.end_date, stayToday());
}

/** Passés : tout le reste, y compris un séjour futur déjà marqué terminé. */
export function isClientPastStay(booking: Stay) {
  return !isClientUpcomingStay(booking);
}
