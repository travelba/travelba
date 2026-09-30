import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { rankAdminSearch, type AdminSearchBooking, type AdminSearchCustomer } from "@/lib/crm/admin-search";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { customerFullName } from "@/lib/crm/types";

function pattern(value: string) {
  return `%${value.replace(/[%_]/g, "").trim()}%`;
}

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const { supabase } = await requireStaffPage();
  if (!query) {
    return (
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Recherche" subtitle="Un nom ouvre une fiche. Une référence, un hôtel ou une confirmation ouvre le dossier." />
      </div>
    );
  }

  const needle = pattern(query);
  const referenceQuery = /^tb-/i.test(query);
  const [references, confirmations, hotelTitles, hotelDetails, firstNames, lastNames] = await Promise.all([
    referenceQuery
      ? supabase.from("crm_bookings").select("id, reference, title, destination, archived_at").ilike("reference", needle).limit(8)
      : Promise.resolve({ data: [] as AdminSearchBooking[] }),
    supabase.from("crm_booking_items").select("booking_id").ilike("confirmation_ref", needle).limit(12),
    supabase.from("crm_booking_items").select("booking_id").eq("kind", "hotel").ilike("title", needle).limit(12),
    supabase
      .from("crm_booking_items")
      .select("booking_id")
      .eq("kind", "hotel")
      .filter("details->>hotel_name", "ilike", needle)
      .limit(12),
    referenceQuery
      ? Promise.resolve({ data: [] as AdminSearchCustomer[] })
      : supabase.from("crm_customers").select("id, first_name, last_name").ilike("first_name", needle).limit(8),
    referenceQuery
      ? Promise.resolve({ data: [] as AdminSearchCustomer[] })
      : supabase.from("crm_customers").select("id, first_name, last_name").ilike("last_name", needle).limit(8),
  ]);

  const bookingIds = [
    ...((confirmations.data || []) as { booking_id: string }[]),
    ...((hotelTitles.data || []) as { booking_id: string }[]),
    ...((hotelDetails.data || []) as { booking_id: string }[]),
  ].map((row) => row.booking_id);
  const uniqueIds = [...new Set(bookingIds)];
  const { data: linked } = uniqueIds.length
    ? await supabase.from("crm_bookings").select("id, reference, title, destination, archived_at").in("id", uniqueIds)
    : { data: [] as AdminSearchBooking[] };
  const byId = new Map(((linked || []) as AdminSearchBooking[]).map((row) => [row.id, row]));
  const bookingsFor = (rows: { booking_id: string }[] | null) =>
    (rows || []).map((row) => byId.get(row.booking_id)).filter((row): row is AdminSearchBooking => Boolean(row));

  const customers = new Map<string, AdminSearchCustomer>();
  for (const row of [...((firstNames.data || []) as AdminSearchCustomer[]), ...((lastNames.data || []) as AdminSearchCustomer[])]) {
    customers.set(row.id, row);
  }

  const hit = rankAdminSearch({
    query,
    byReference: (references.data || []) as AdminSearchBooking[],
    byConfirmation: bookingsFor((confirmations.data || []) as { booking_id: string }[]),
    byHotel: bookingsFor([
      ...((hotelTitles.data || []) as { booking_id: string }[]),
      ...((hotelDetails.data || []) as { booking_id: string }[]),
    ]),
    customers: [...customers.values()],
  });
  if (hit.href) redirect(hit.href);

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Recherche" subtitle={`« ${query} »`} />
      <div className="mt-6 space-y-6">
        {hit.bookings.length ? (
          <section className="admin-af-card overflow-hidden rounded-2xl">
            <h2 className="border-b border-border px-5 py-4 font-display text-lg font-bold">Dossiers</h2>
            <ul className="divide-y divide-border text-sm">
              {hit.bookings.map((booking) => (
                <li key={booking.id}>
                  <Link href={`/admin/reservations/${booking.id}`} className="block px-5 py-3 font-semibold text-[var(--admin-navy)]">
                    {booking.reference} · {booking.title}
                    {booking.archived_at ? " · Archivée" : ""}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {hit.customers.length ? (
          <section className="admin-af-card overflow-hidden rounded-2xl">
            <h2 className="border-b border-border px-5 py-4 font-display text-lg font-bold">Clients</h2>
            <ul className="divide-y divide-border text-sm">
              {hit.customers.map((customer) => (
                <li key={customer.id}>
                  <Link href={`/admin/clients/${customer.id}`} className="block px-5 py-3 font-semibold text-[var(--admin-navy)]">
                    {customerFullName(customer)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {!hit.bookings.length && !hit.customers.length ? (
          <p className="text-sm text-muted">Aucun client ni dossier pour cette recherche.</p>
        ) : null}
      </div>
    </div>
  );
}
