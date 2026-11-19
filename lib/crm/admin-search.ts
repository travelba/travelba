import { attachSearchFold } from "./attach-search";

export type AdminSearchBooking = {
  id: string;
  reference: string;
  title: string;
  destination: string | null;
  archived_at?: string | null;
  owner_staff_id?: string | null;
};

export type AdminSearchCustomer = {
  id: string;
  first_name: string;
  last_name: string;
};

export type AdminSearchHit = {
  bookings: AdminSearchBooking[];
  customers: AdminSearchCustomer[];
  /** Une seule cible : l’omnibar y va directement. */
  href: string | null;
};

function uniqueBookings(rows: AdminSearchBooking[]) {
  const seen = new Set<string>();
  const out: AdminSearchBooking[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function rankAdminSearch(input: {
  query: string;
  byReference: AdminSearchBooking[];
  byConfirmation: AdminSearchBooking[];
  byHotel: AdminSearchBooking[];
  customers: AdminSearchCustomer[];
}): AdminSearchHit {
  const query = input.query.trim();
  const referenceQuery = /^tb-/i.test(query);
  const bookings = uniqueBookings(
    referenceQuery
      ? input.byReference
      : [...input.byConfirmation, ...input.byHotel, ...input.byReference]
  );
  const customers = referenceQuery ? [] : input.customers;
  let href: string | null = null;
  if (referenceQuery && bookings.length === 1) {
    href = `/admin/reservations/${bookings[0].id}`;
  } else if (bookings.length === 1 && customers.length === 0) {
    href = `/admin/reservations/${bookings[0].id}`;
  } else if (!bookings.length && customers.length === 1) {
    href = `/admin/clients/${customers[0].id}`;
  }
  return { bookings, customers, href };
}

/**
 * Une référence seule ouvre le dossier. Un seul client, sans dossier, ouvre la fiche.
 * Un prénom qui retrouve la fiche et ses dossiers reste sur la page de résultats.
 */
export function pickSearchHref(query: string, hit: { bookings: { id: string }[]; customers: { id: string }[] }) {
  const referenceQuery = /^tb-/i.test(query.trim()) || /^tb\d/i.test(attachSearchFold(query).replace(/ /g, ""));
  if (referenceQuery && hit.bookings.length === 1) return `/admin/reservations/${hit.bookings[0].id}`;
  if (hit.bookings.length === 1 && hit.customers.length === 0) return `/admin/reservations/${hit.bookings[0].id}`;
  if (hit.customers.length === 1 && hit.bookings.length === 0) return `/admin/clients/${hit.customers[0].id}`;
  return null;
}
