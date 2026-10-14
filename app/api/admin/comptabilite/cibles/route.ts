import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { itemLabelFor } from "@/lib/crm/trip-costs-db";
import { createServiceClient } from "@/lib/supabase/admin";

export type CostTargetOption = {
  id: string;
  reference: string;
  title: string;
  client: string;
  items: { id: string; label: string; kind: string | null; amount: number | null }[];
};

function escapeLike(value: string) {
  return value.replace(/[%_,().]/g, " ").trim();
}

/** Voyages où rattacher une sortie : recherche par référence, titre, destination ou nom du client. */
export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const q = escapeLike(url.searchParams.get("q") || "").slice(0, 60);
  const only = url.searchParams.get("booking") || "";
  const admin = createServiceClient();
  const select = "id, reference, title, destination, status, customer_id";
  let query = admin.from("crm_bookings").select(select).neq("status", "cancelled").order("created_at", { ascending: false }).limit(15);
  if (only) query = admin.from("crm_bookings").select(select).eq("id", only).limit(1);
  else if (q) {
    const { data: people } = await admin
      .from("crm_customers")
      .select("id")
      .or(`last_name.ilike.%${q}%,company_name.ilike.%${q}%`)
      .limit(30);
    const ids = ((people || []) as { id: string }[]).map((row) => row.id);
    const parts = [`reference.ilike.%${q}%`, `title.ilike.%${q}%`, `destination.ilike.%${q}%`];
    if (ids.length) parts.push(`customer_id.in.(${ids.join(",")})`);
    query = query.or(parts.join(","));
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ bookings: [] });
  const rows = (data || []) as {
    id: string;
    reference: string;
    title: string | null;
    destination: string | null;
    customer_id: string | null;
  }[];
  const bookingIds = rows.map((row) => row.id);
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const [{ data: items }, { data: people }] = await Promise.all([
    bookingIds.length
      ? admin
          .from("crm_booking_items")
          .select("id, booking_id, kind, title, amount, details, lifecycle")
          .in("booking_id", bookingIds)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    customerIds.length
      ? admin.from("crm_customers").select("id, first_name, last_name, company_name").in("id", customerIds)
      : Promise.resolve({ data: [] }),
  ]);
  const names = new Map(
    ((people || []) as { id: string; first_name: string | null; last_name: string | null; company_name: string | null }[]).map(
      (person) => [person.id, [person.first_name, person.last_name].filter(Boolean).join(" ") || person.company_name || ""]
    )
  );
  const byBooking = new Map<string, CostTargetOption["items"]>();
  for (const item of (items || []) as { id: string; booking_id: string; kind: string | null; title: string | null; amount: number | null; details: Record<string, unknown> | null; lifecycle: string | null }[]) {
    if (item.lifecycle === "superseded" || item.lifecycle === "cancelled") continue;
    const list = byBooking.get(item.booking_id) || [];
    list.push({ id: item.id, label: itemLabelFor(item), kind: item.kind, amount: item.amount == null ? null : Number(item.amount) });
    byBooking.set(item.booking_id, list);
  }
  const bookings: CostTargetOption[] = rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    title: row.title || row.destination || "",
    client: (row.customer_id && names.get(row.customer_id)) || "",
    items: byBooking.get(row.id) || [],
  }));
  return NextResponse.json({ bookings });
}
