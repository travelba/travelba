import { greetingGivenName } from "./identity";
import { customerFullName, type CrmCustomer } from "./types";

type FicheBookingRow = {
  id: string;
  customer_id: string;
  start_date: string | null;
};

/** Dossiers du voyageur + dossiers facturés sur ce compte (collaborateur rattaché). */
export function mergeFicheBookings<T extends FicheBookingRow>(owned: T[], billed: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of owned) byId.set(row.id, row);
  for (const row of billed) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort(byStartDateDesc);
}

export function ficheTravelerCaption(
  customer: Pick<CrmCustomer, "first_name" | "last_name">
) {
  const given = greetingGivenName(customer.first_name);
  const last = customer.last_name?.trim();
  const short = [given, last].filter(Boolean).join(" ");
  return short || customerFullName(customer);
}

/** Ligne sous le dossier quand le voyageur n’est pas le titulaire de la fiche. */
export function ficheBookingTravelerLine(
  booking: { customer_id: string },
  ficheCustomerId: string,
  names: ReadonlyMap<string, string>
): string | null {
  if (booking.customer_id === ficheCustomerId) return null;
  const name = names.get(booking.customer_id)?.trim();
  return name ? `Voyage de ${name}` : "Voyage d’un collaborateur";
}

function byStartDateDesc(a: FicheBookingRow, b: FicheBookingRow) {
  if (a.start_date === b.start_date) return 0;
  if (!a.start_date) return 1;
  if (!b.start_date) return -1;
  return a.start_date < b.start_date ? 1 : -1;
}
