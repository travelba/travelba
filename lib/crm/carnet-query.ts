import type { SupabaseClient } from "@supabase/supabase-js";
import { applyClientBookingScope } from "@/lib/crm/company-role";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";
import { carnetVisible, stayArrivalPlaces } from "@/lib/crm/carnet";
import { clientStayFace, type ClientStayFace, type StayFaceItem } from "@/lib/crm/client-stay-face";
import { tripCityPlan } from "@/lib/crm/layover";
import { stayCitiesFromSteps } from "@/lib/crm/staff-stay";

export async function loadVisibleCarnets(
  supabase: SupabaseClient,
  customerId: string,
  ownerIds?: string[],
  travelerBookingIds?: string[]
) {
  const ids = [...new Set((ownerIds?.length ? ownerIds : [customerId]).filter(Boolean))];
  let query = supabase
    .from("crm_bookings")
    .select("*")
    .is("archived_at", null)
    .order("start_date", { ascending: false, nullsFirst: false });
  query = applyClientBookingScope(query, { ownerIds: ids, travelerBookingIds: travelerBookingIds || [] });
  const { data } = await query;
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

/** Séjours visibles et leur face, une seule lecture des cartes. */
export async function loadClientCarnets(
  supabase: SupabaseClient,
  customerId: string,
  ownerIds?: string[],
  homeCity?: string | null,
  travelerBookingIds?: string[]
) {
  const ids = [...new Set((ownerIds?.length ? ownerIds : [customerId]).filter(Boolean))];
  let query = supabase
    .from("crm_bookings")
    .select("*")
    .is("archived_at", null)
    .order("start_date", { ascending: false, nullsFirst: false });
  query = applyClientBookingScope(query, { ownerIds: ids, travelerBookingIds: travelerBookingIds || [] });
  const { data } = await query;
  const all = (data || []) as CrmBooking[];
  const faces: Record<string, ClientStayFace> = {};
  if (!all.length) return { bookings: [] as CrmBooking[], faces };
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
  const bookings = all.filter((booking) => carnetVisible(booking, byBooking.get(booking.id) || []));
  for (const booking of bookings) {
    faces[booking.id] = clientStayFace({
      title: booking.title,
      destination: booking.destination,
      startDate: booking.start_date,
      endDate: booking.end_date,
      items: byBooking.get(booking.id) || [],
      homeCity,
    });
  }
  return { bookings, faces };
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
  const layovers: Record<string, string[]> = {};
  const countries: Record<string, string[]> = {};
  if (!ids.length) return { arrival, route, layovers, countries };
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
    const shown = opts?.visibleOnly ? items.filter((item) => item.visible_to_client !== false) : items;
    const places = stayArrivalPlaces(null, null, shown);
    if (places.length) arrival[id] = places;
    const cities = stayCitiesFromSteps(shown);
    if (cities.length) route[id] = cities;
    const stops = tripCityPlan(shown).layovers;
    if (stops.length) layovers[id] = stops;
    const named = stayCountries(shown);
    if (named.length) countries[id] = named;
  }
  return { arrival, route, layovers, countries };
}

/** Pays écrits sur les cartes, pour le repli de couverture d’une ville sans image. */
export function stayCountries(items: Array<{ details?: Record<string, unknown> | null }>) {
  const names: string[] = [];
  for (const item of items) {
    const value = item.details?.country;
    const name = typeof value === "string" ? value.trim() : "";
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

type FaceBooking = Pick<CrmBooking, "id" | "title" | "destination" | "start_date" | "end_date">;

/** Titre, villes, dates et photo que le client voit, une lecture pour toute la liste. */
export async function loadClientStayFaces(
  supabase: SupabaseClient,
  bookings: FaceBooking[],
  homeCity?: string | null
) {
  const faces: Record<string, ClientStayFace> = {};
  const ids = [...new Set(bookings.map((row) => row.id).filter(Boolean))];
  if (!ids.length) return faces;
  const { data } = await supabase
    .from("crm_booking_items")
    .select("booking_id, kind, title, start_at, end_at, sort_order, details, lifecycle, visible_to_client")
    .in("booking_id", ids);
  const grouped = new Map<string, StayFaceItem[]>();
  for (const row of (data || []) as (StayFaceItem & { booking_id: string })[]) {
    const list = grouped.get(row.booking_id) || [];
    list.push(row);
    grouped.set(row.booking_id, list);
  }
  for (const booking of bookings) {
    faces[booking.id] = clientStayFace({
      title: booking.title,
      destination: booking.destination,
      startDate: booking.start_date,
      endDate: booking.end_date,
      items: grouped.get(booking.id) || [],
      homeCity,
    });
  }
  return faces;
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
