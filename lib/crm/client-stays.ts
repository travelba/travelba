import { isUpcomingBooking } from "@/lib/crm/money";

type Stay = { end_date: string | null; status: string };

/** À venir : date encore ouverte, et le séjour n’est ni terminé ni annulé. */
export function isClientUpcomingStay(booking: Stay) {
  return isUpcomingBooking(booking.end_date) && booking.status !== "cancelled" && booking.status !== "completed";
}

/** Passés : tout le reste, y compris un séjour futur déjà marqué terminé. */
export function isClientPastStay(booking: Stay) {
  return !isClientUpcomingStay(booking);
}
