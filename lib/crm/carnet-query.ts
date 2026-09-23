import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";
import { carnetVisible } from "@/lib/crm/carnet";

export async function loadVisibleCarnets(supabase: SupabaseClient, customerId: string) {
  const { data } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customerId)
    .order("start_date", { ascending: false, nullsFirst: false });
  const all = (data || []) as CrmBooking[];
  if (!all.length) return [] as CrmBooking[];
  const { data: itemRows } = await supabase
    .from("crm_booking_items")
    .select("*")
    .in(
      "booking_id",
      all.map((row) => row.id)
    );
  const byBooking = new Map<string, CrmBookingItem[]>();
  for (const item of (itemRows || []) as CrmBookingItem[]) {
    const list = byBooking.get(item.booking_id) || [];
    list.push(item);
    byBooking.set(item.booking_id, list);
  }
  return all.filter((booking) => carnetVisible(booking, byBooking.get(booking.id) || []));
}

export function sortBookingsByStart<T extends { start_date: string | null }>(
  rows: T[],
  direction: "asc" | "desc"
) {
  const missing = direction === "asc" ? "9999-99-99" : "";
  return rows.slice().sort((a, b) => {
    const left = a.start_date || missing;
    const right = b.start_date || missing;
    return direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
  });
}
