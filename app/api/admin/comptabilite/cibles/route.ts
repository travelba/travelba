import { NextResponse } from "next/server";
import {
  ATTACH_CANDIDATE_LIMIT,
  ATTACH_RESULT_LIMIT,
  type AttachBookingRow,
  type AttachCompany,
  type AttachItemRow,
  type AttachPerson,
  type AttachTraveler,
  shapeAttachTargets,
} from "@/lib/crm/attach-search";
import { findAttachBookingIds } from "@/lib/crm/attach-search-db";
import { requireStaff } from "@/lib/crm/auth";
import { parisTodayIso } from "@/lib/crm/dates";
import { createServiceClient } from "@/lib/supabase/admin";

const BOOKING_COLUMNS =
  "id, reference, title, destination, status, customer_id, billing_company_id, start_date, end_date";

function escapeLike(value: string) {
  return value.replace(/[%_,().]/g, " ").trim();
}

type Admin = ReturnType<typeof createServiceClient>;

async function hydrate(admin: Admin, rows: AttachBookingRow[], query: string, includeCancelled = false) {
  const bookingIds = rows.map((row) => row.id);
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const companyIds = [...new Set(rows.map((row) => row.billing_company_id).filter((id): id is string => Boolean(id)))];
  const [people, byCustomer, byId, travelers, items] = await Promise.all([
    customerIds.length
      ? admin.from("crm_customers").select("id, first_name, last_name, usage_name, company_name").in("id", customerIds)
      : Promise.resolve({ data: [] }),
    customerIds.length
      ? admin.from("crm_billing_companies").select("id, customer_id, company_name").in("customer_id", customerIds)
      : Promise.resolve({ data: [] }),
    companyIds.length
      ? admin.from("crm_billing_companies").select("id, customer_id, company_name").in("id", companyIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin.from("crm_booking_travelers").select("booking_id, first_name, last_name").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin
          .from("crm_booking_items")
          .select("id, booking_id, kind, title, amount, details, lifecycle")
          .in("booking_id", bookingIds)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);
  const companies = new Map<string, AttachCompany>();
  for (const row of [...(byCustomer.data || []), ...(byId.data || [])] as AttachCompany[]) {
    companies.set(row.id, row);
  }
  return shapeAttachTargets({
    query,
    today: parisTodayIso(),
    bookings: rows,
    customers: (people.data || []) as AttachPerson[],
    companies: [...companies.values()],
    travelers: (travelers.data || []) as AttachTraveler[],
    items: (items.data || []) as AttachItemRow[],
    limit: ATTACH_RESULT_LIMIT,
    includeCancelled,
  });
}

/** Ancienne recherche, si la fonction indexée n’est pas encore appliquée. */
async function legacyBookings(admin: Admin, q: string) {
  const needle = escapeLike(q).slice(0, 60);
  if (!needle) return [];
  const { data: people } = await admin
    .from("crm_customers")
    .select("id")
    .or(`first_name.ilike.%${needle}%,last_name.ilike.%${needle}%,company_name.ilike.%${needle}%`)
    .limit(30);
  const ids = ((people || []) as { id: string }[]).map((row) => row.id);
  const parts = [`reference.ilike.%${needle}%`, `title.ilike.%${needle}%`, `destination.ilike.%${needle}%`];
  if (ids.length) parts.push(`customer_id.in.(${ids.join(",")})`);
  const { data, error } = await admin
    .from("crm_bookings")
    .select(BOOKING_COLUMNS)
    .neq("status", "cancelled")
    .or(parts.join(","))
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(30);
  if (error) return [];
  return (data || []) as AttachBookingRow[];
}

/** Voyages où rattacher une sortie. Référence, client, société, destination, voyageurs. */
export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const only = (url.searchParams.get("booking") || "").trim();
  const admin = createServiceClient();

  if (only) {
    const { data, error } = await admin.from("crm_bookings").select(BOOKING_COLUMNS).eq("id", only).limit(1);
    if (error) return NextResponse.json({ bookings: [] });
    const bookings = await hydrate(admin, (data || []) as AttachBookingRow[], "", true);
    return NextResponse.json({ bookings });
  }

  let rows: AttachBookingRow[] = [];
  if (q) {
    const ids = await findAttachBookingIds(admin, q, ATTACH_CANDIDATE_LIMIT);
    if (ids && !ids.length) return NextResponse.json({ bookings: [] });
    if (ids?.length) {
      const { data, error } = await admin.from("crm_bookings").select(BOOKING_COLUMNS).in("id", ids).limit(ATTACH_CANDIDATE_LIMIT);
      rows = error ? [] : ((data || []) as AttachBookingRow[]);
    } else {
      rows = await legacyBookings(admin, q);
    }
  } else {
    const { data, error } = await admin
      .from("crm_bookings")
      .select(BOOKING_COLUMNS)
      .neq("status", "cancelled")
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(60);
    if (error) return NextResponse.json({ bookings: [] });
    rows = (data || []) as AttachBookingRow[];
  }

  const bookings = await hydrate(admin, rows, q);
  return NextResponse.json({ bookings });
}
