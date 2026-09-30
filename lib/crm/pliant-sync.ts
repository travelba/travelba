import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { fetchPliantTransactions, pliantConfigured } from "./pliant";
import { mapPliantTransaction } from "./pliant-tx";

const CARD_TABLES = ["crm_hotel_arrivals", "crm_booking_pliant_cards", "crm_pliant_cards", "crm_visa_cards"] as const;

export async function syncPliantAccount() {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const fetched = await fetchPliantTransactions();
  const admin = createServiceClient();
  const rows = fetched.map(mapPliantTransaction).filter((row): row is NonNullable<typeof row> => Boolean(row));
  const links = await bookingsForCards(
    admin,
    rows.map((row) => row.card_id).filter((id): id is string => Boolean(id))
  );
  let stored = 0;
  for (const row of rows) {
    const link = row.card_id ? links.get(row.card_id) : undefined;
    const { error } = await admin.from("crm_pliant_transactions").upsert(
      {
        ...row,
        booking_id: link?.bookingId ?? null,
        customer_id: link?.customerId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pliant_transaction_id" }
    );
    if (error) {
      console.error("[pliant] upsert", error.code || "", error.message || "");
      throw new Error("Les transactions Pliant n’ont pas pu être enregistrées.");
    }
    stored += 1;
  }
  return { fetched: fetched.length, stored };
}

async function bookingsForCards(
  admin: ReturnType<typeof createServiceClient>,
  cardIds: string[]
) {
  const links = new Map<string, { bookingId: string; customerId: string | null }>();
  const unique = [...new Set(cardIds)];
  if (!unique.length) return links;
  for (const table of CARD_TABLES) {
    const { data, error } = await admin.from(table).select("pliant_card_id, booking_id").in("pliant_card_id", unique);
    if (error || !data) continue;
    for (const row of data as { pliant_card_id: string | null; booking_id: string | null }[]) {
      if (!row.pliant_card_id || !row.booking_id || links.has(row.pliant_card_id)) continue;
      links.set(row.pliant_card_id, { bookingId: row.booking_id, customerId: null });
    }
  }
  const bookingIds = [...new Set([...links.values()].map((link) => link.bookingId))];
  if (!bookingIds.length) return links;
  const { data: bookings } = await admin
    .from("crm_bookings")
    .select("id, customer_id, billing_customer_id")
    .in("id", bookingIds);
  const customers = new Map(
    ((bookings || []) as { id: string; customer_id: string | null; billing_customer_id: string | null }[]).map((row) => [
      row.id,
      row.billing_customer_id || row.customer_id,
    ])
  );
  for (const [cardId, link] of links) {
    links.set(cardId, { bookingId: link.bookingId, customerId: customers.get(link.bookingId) || null });
  }
  return links;
}
