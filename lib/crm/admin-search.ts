export type AdminSearchBooking = {
  id: string;
  reference: string;
  title: string;
  destination: string | null;
  archived_at?: string | null;
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
  const customers = referenceQuery || bookings.length ? [] : input.customers;
  // Un nom qui est aussi un hôtel ou une confirmation ouvre le dossier.
  // Sans dossier, le nom ouvre les fiches.
  const bookingFirst = bookings.length > 0;
  const shownCustomers = bookingFirst ? [] : customers;
  let href: string | null = null;
  if (bookings.length === 1 && shownCustomers.length === 0) {
    href = `/admin/reservations/${bookings[0].id}`;
  } else if (!bookings.length && shownCustomers.length === 1) {
    href = `/admin/clients/${shownCustomers[0].id}`;
  }
  return { bookings, customers: shownCustomers, href };
}
