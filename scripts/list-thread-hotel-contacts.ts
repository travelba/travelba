/**
 * Liste les contacts hôtel qui seraient ajoutés depuis les fils déjà enregistrés.
 * Lecture seule. N’écrit rien.
 *
 *   npx tsx scripts/list-thread-hotel-contacts.ts
 */
import { createServiceClient } from "../lib/supabase/admin";
import { hotelContactsToAdd, partiesFromThreadRows, threadContactCandidates } from "../lib/crm/mail-reply";
import { leHotelIdFromItem } from "../lib/crm/hotel-contact";

type ThreadRow = {
  booking_id: string;
  booking_item_id: string;
  direction: string | null;
  from_email: string | null;
  counts_as_reply: boolean | null;
  to_emails?: string[] | null;
  cc_emails?: string[] | null;
};

type ItemRow = {
  id: string;
  booking_id: string;
  title: string | null;
  details: Record<string, unknown> | null;
};

async function everyRow<T>(
  load: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
) {
  const rows: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const page = await load(from, from + size - 1);
    if (page.error) throw new Error(page.error.message);
    const chunk = page.data || [];
    rows.push(...chunk);
    if (chunk.length < size) return rows;
  }
}

async function main() {
  const admin = createServiceClient();
  const loose = admin as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string) => {
          range: (from: number, to: number) => Promise<{ data: ThreadRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const wide = "booking_id, booking_item_id, direction, from_email, counts_as_reply, to_emails, cc_emails";
  const narrow = "booking_id, booking_item_id, direction, from_email, counts_as_reply";
  const probe = await loose.from("crm_hotel_thread_messages").select(wide).order("id").range(0, 0);
  const columns = probe.error ? narrow : wide;
  const threads = await everyRow<ThreadRow>((from, to) =>
    loose.from("crm_hotel_thread_messages").select(columns).order("id").range(from, to)
  );
  const itemIds = [...new Set(threads.map((row) => row.booking_item_id))];
  const items: ItemRow[] = [];
  for (let index = 0; index < itemIds.length; index += 200) {
    const slice = itemIds.slice(index, index + 200);
    const { data, error } = await admin.from("crm_booking_items").select("id, booking_id, title, details").in("id", slice);
    if (error) throw new Error(error.message);
    items.push(...((data || []) as ItemRow[]));
  }
  const bookingIds = [...new Set(items.map((item) => item.booking_id))];
  const guestByBooking = new Map<string, string[]>();
  for (let index = 0; index < bookingIds.length; index += 200) {
    const slice = bookingIds.slice(index, index + 200);
    const { data, error } = await admin.from("crm_bookings").select("id, customer_id").in("id", slice);
    if (error) throw new Error(error.message);
    const stays = (data || []) as { id: string; customer_id: string | null }[];
    const customerIds = [...new Set(stays.map((stay) => stay.customer_id).filter((id): id is string => Boolean(id)))];
    const emails = new Map<string, string[]>();
    if (customerIds.length) {
      const { data: people, error: peopleError } = await admin
        .from("crm_customers")
        .select("id, email, billing_email")
        .in("id", customerIds);
      if (peopleError) throw new Error(peopleError.message);
      for (const person of (people || []) as { id: string; email: string | null; billing_email: string | null }[]) {
        emails.set(person.id, [person.email || "", person.billing_email || ""].filter(Boolean));
      }
    }
    for (const stay of stays) guestByBooking.set(stay.id, emails.get(stay.customer_id || "") || []);
  }
  const hotelIds = [
    ...new Set(items.map((item) => leHotelIdFromItem({ details: item.details || {} })).filter((id): id is number => id != null)),
  ];
  const known = new Map<number, string[]>();
  for (let index = 0; index < hotelIds.length; index += 200) {
    const slice = hotelIds.slice(index, index + 200);
    const { data, error } = await admin.from("crm_hotel_contacts").select("le_hotel_id, email").in("le_hotel_id", slice);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as { le_hotel_id: number; email: string | null }[]) {
      const list = known.get(row.le_hotel_id) || [];
      if (row.email) list.push(row.email);
      known.set(row.le_hotel_id, list);
    }
  }
  let count = 0;
  let stayOnly = 0;
  for (const item of items) {
    const parties = partiesFromThreadRows(threads.filter((row) => row.booking_item_id === item.id));
    const exclude = guestByBooking.get(item.booking_id) || [];
    const hotelId = leHotelIdFromItem({ details: item.details || {} });
    const adding = hotelContactsToAdd({
      existing: hotelId == null ? [] : known.get(hotelId) || [],
      candidates: threadContactCandidates(parties, exclude),
      exclude,
    });
    if (!adding.length) continue;
    const name =
      (typeof item.details?.hotel_name === "string" && item.details.hotel_name.trim()) || item.title || "Hôtel";
    const where = hotelId == null ? "séjour seulement" : `catalogue ${hotelId}`;
    console.log(`${name} · ${where}`);
    for (const person of adding) {
      console.log(`  ${person.email}`);
      count += 1;
      if (hotelId == null) stayOnly += 1;
    }
  }
  console.log(`${count} contact${count === 1 ? "" : "s"} seraient ajoutés. ${stayOnly} sans numéro d’hôtel. Lecture seule.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lecture impossible.");
  process.exit(1);
});
