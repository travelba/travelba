import type { SupabaseClient } from "@supabase/supabase-js";
import { CUSTOMER_NAME_SELECT, type CustomerNameRow } from "./customer-search";
import { isoDateInDays } from "./money";
import { serviceDeskLines, type ServiceDeskItem } from "./service-desk";
import { customerFullName } from "./types";

const SERVICE_KINDS = ["chauffeur", "greeter", "checkin"] as const;

type ServiceBookingRow = {
  id: string;
  reference: string;
  status: string;
  customer_id: string;
};

/** Services encore à confirmer sur les dossiers vivants. */
export async function loadAgencyServiceDesk(supabase: SupabaseClient) {
  const { data: activeBookings } = await supabase
    .from("crm_bookings")
    .select("id, reference, status, customer_id")
    .neq("status", "cancelled")
    .is("archived_at", null)
    .or(`end_date.is.null,end_date.gte.${isoDateInDays(-1)}`)
    .order("start_date", { ascending: true, nullsFirst: false })
    .limit(300);
  const serviceBookings = (activeBookings || []) as ServiceBookingRow[];
  const serviceBookingIds = serviceBookings.map((row) => row.id);
  const { data: serviceRows } = serviceBookingIds.length
    ? await supabase
        .from("crm_booking_items")
        .select("id, booking_id, kind, title, start_at, end_at, details")
        .in("booking_id", serviceBookingIds)
        .in("kind", [...SERVICE_KINDS])
    : { data: [] as ServiceDeskItem[] };
  const serviceItems = (serviceRows || []) as ServiceDeskItem[];
  const withServices = [...new Set(serviceItems.map((row) => row.booking_id))];
  const named = serviceBookings.filter((row) => withServices.includes(row.id));
  const nameIds = [...new Set(named.map((row) => row.customer_id).filter(Boolean))];
  const [{ data: flights }, { data: customers }] = await Promise.all([
    withServices.length
      ? supabase
          .from("crm_booking_items")
          .select("id, booking_id, kind, title, start_at, end_at, details")
          .in("booking_id", withServices)
          .eq("kind", "flight")
      : Promise.resolve({ data: [] as ServiceDeskItem[] }),
    nameIds.length
      ? supabase.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", nameIds)
      : Promise.resolve({ data: [] as CustomerNameRow[] }),
  ]);
  const names = Object.fromEntries(
    ((customers || []) as CustomerNameRow[]).map((row) => [row.id, customerFullName(row)])
  );
  return serviceDeskLines({
    now: new Date(),
    names,
    bookings: named,
    items: [...serviceItems, ...((flights || []) as ServiceDeskItem[])],
  });
}
