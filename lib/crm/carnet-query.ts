import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";
import { carnetVisible, stayArrivalPlaces } from "@/lib/crm/carnet";
import { stayCitiesFromSteps } from "@/lib/crm/staff-stay";

export async function loadVisibleCarnets(supabase: SupabaseClient, customerId: string) {
  const { data } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customerId)
    .is("archived_at", null)
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

type StayStep = {
  booking_id: string;
  kind?: string | null;
  title?: string | null;
  details?: Record<string, unknown> | null;
  sort_order?: number | null;
  start_at?: string | null;
  end_at?: string | null;
  visible_to_client?: boolean | null;
};

/** Villes d’arrivée (couverture) et villes du titre, lues sur les étapes. */
export async function loadStayMaps(
  supabase: SupabaseClient,
  bookingIds: string[],
  opts?: { visibleOnly?: boolean }
) {
  const ids = [...new Set(bookingIds.filter(Boolean))];
  const arrival: Record<string, string[]> = {};
  const route: Record<string, string[]> = {};
  if (!ids.length) return { arrival, route };
  const { data } = await supabase
    .from("crm_booking_items")
    .select("booking_id, kind, title, details, sort_order, start_at, end_at, visible_to_client")
    .in("booking_id", ids)
    .order("sort_order");
  const grouped = new Map<string, StayStep[]>();
  for (const row of (data || []) as StayStep[]) {
    const list = grouped.get(row.booking_id) || [];
    list.push(row);
    grouped.set(row.booking_id, list);
  }
  for (const id of ids) {
    const items = grouped.get(id) || [];
    const places = stayArrivalPlaces(null, null, items);
    if (places.length) arrival[id] = places;
    const titled = opts?.visibleOnly ? items.filter((item) => item.visible_to_client !== false) : items;
    const cities = stayCitiesFromSteps(titled);
    if (cities.length) route[id] = cities;
  }
  return { arrival, route };
}

/** Villes d’arrivée par dossier, pour la couverture (pays / diagonale). */
export async function loadStayArrivalPlaces(supabase: SupabaseClient, bookingIds: string[]) {
  return (await loadStayMaps(supabase, bookingIds)).arrival;
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
