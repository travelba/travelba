import type { SupabaseClient } from "@supabase/supabase-js";
import { closeEveningTables, type RestaurantChoice, type TableSeat, type TableStatus } from "./restaurants";
import { RESTAURANT_TEST_EMAIL, RESTAURANT_TEST_REFERENCE } from "./restaurant-test";

const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

function missing(error: { code?: string | null } | null) {
  return Boolean(error && MISSING.has(error.code || ""));
}

export async function ensureRestaurantTestStay(db: SupabaseClient, now = new Date()) {
  const existing = await db.from("crm_customers").select("id").eq("email", RESTAURANT_TEST_EMAIL).maybeSingle();
  if (existing.error) {
    if (missing(existing.error)) return { error: "Le mode test n’est pas encore en place. Migration à jouer." };
    return { error: "Lecture impossible." };
  }
  let customerId = (existing.data as { id?: string } | null)?.id || "";
  if (!customerId) {
    const created = await db
      .from("crm_customers")
      .insert({
        first_name: "TEST",
        last_name: "Benjamin",
        email: RESTAURANT_TEST_EMAIL,
        sex: "M",
        phone: null,
        is_test: true,
      })
      .select("id")
      .single();
    if (created.error || !created.data) {
      if (missing(created.error)) return { error: "Le mode test n’est pas encore en place. Migration à jouer." };
      return { error: "Le client test n’a pas pu être créé." };
    }
    customerId = (created.data as { id: string }).id;
  }
  const booking = await db.from("crm_bookings").select("id").eq("reference", RESTAURANT_TEST_REFERENCE).maybeSingle();
  if (booking.error) {
    if (missing(booking.error)) return { error: "Le mode test n’est pas encore en place. Migration à jouer." };
    return { error: "Lecture impossible." };
  }
  let bookingId = (booking.data as { id?: string } | null)?.id || "";
  const today = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  if (!bookingId) {
    const created = await db
      .from("crm_bookings")
      .insert({
        customer_id: customerId,
        reference: RESTAURANT_TEST_REFERENCE,
        title: "TEST Benjamin",
        destination: "Milan",
        status: "draft",
        start_date: today,
        end_date: end,
        timezone: "Europe/Rome",
        visible_to_client: false,
        is_test: true,
      })
      .select("id")
      .single();
    if (created.error || !created.data) {
      if (missing(created.error)) return { error: "Le mode test n’est pas encore en place. Migration à jouer." };
      return { error: "Le séjour test n’a pas pu être créé." };
    }
    bookingId = (created.data as { id: string }).id;
  }
  return { ok: true as const, customerId, bookingId };
}

export async function purgeRestaurantTest(db: SupabaseClient) {
  const booking = await db.from("crm_bookings").select("id").eq("reference", RESTAURANT_TEST_REFERENCE).maybeSingle();
  if (booking.error && missing(booking.error)) return { error: "Le mode test n’est pas encore en place. Migration à jouer." };
  const bookingId = (booking.data as { id?: string } | null)?.id;
  if (bookingId) {
    await db.from("crm_restaurant_messages").delete().eq("booking_id", bookingId);
    await db.from("crm_restaurant_evenings").delete().eq("booking_id", bookingId);
    await db.from("crm_restaurant_tables").delete().eq("booking_id", bookingId);
    const removed = await db.from("crm_bookings").delete().eq("id", bookingId);
    if (removed.error) return { error: "Le séjour test n’a pas pu être retiré." };
  }
  await db.from("crm_customers").delete().eq("email", RESTAURANT_TEST_EMAIL).eq("is_test", true);
  return { ok: true as const };
}

/** Clôture de 18 h, uniquement sur le séjour test. Les vrais dossiers ne bougent pas. */
export async function simulateRestaurantTestClose(db: SupabaseClient, now = new Date()) {
  const booking = await db.from("crm_bookings").select("id, is_test").eq("reference", RESTAURANT_TEST_REFERENCE).maybeSingle();
  if (booking.error && missing(booking.error)) return { error: "Le mode test n’est pas encore en place. Migration à jouer." };
  const row = booking.data as { id: string; is_test?: boolean } | null;
  if (!row?.id || row.is_test === false) return { error: "Aucun séjour test." };
  const date = now.toISOString().slice(0, 10);
  const [tables, evening] = await Promise.all([
    db.from("crm_restaurant_tables").select("seat, status, is_test").eq("booking_id", row.id).eq("evening_date", date),
    db.from("crm_restaurant_evenings").select("choice, is_test").eq("booking_id", row.id).eq("evening_date", date).maybeSingle(),
  ]);
  if ((tables.error && missing(tables.error)) || (evening.error && missing(evening.error))) {
    return { error: "Le mode test n’est pas encore en place. Migration à jouer." };
  }
  const current = ((tables.data || []) as { seat: TableSeat; status: TableStatus; is_test?: boolean }[]).filter(
    (table) => table.is_test !== false && (table.seat === "A" || table.seat === "B")
  );
  const choice = ((evening.data as { choice?: RestaurantChoice | null } | null)?.choice || null) as RestaurantChoice | null;
  const next = closeEveningTables(current, choice);
  const stamp = now.toISOString();
  for (const table of next) {
    await db
      .from("crm_restaurant_tables")
      .update({ status: table.status, updated_at: stamp, is_test: true })
      .eq("booking_id", row.id)
      .eq("evening_date", date)
      .eq("seat", table.seat)
      .eq("is_test", true);
  }
  await db.from("crm_restaurant_evenings").upsert(
    {
      booking_id: row.id,
      evening_date: date,
      closed_at: stamp,
      is_test: true,
    },
    { onConflict: "booking_id,evening_date" }
  );
  return { ok: true as const, tables: next };
}
