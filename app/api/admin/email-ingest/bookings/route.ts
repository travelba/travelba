import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { BOOKING_STATUS_LABELS, type CrmBooking } from "@/lib/crm/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const customerId = new URL(request.url).searchParams.get("customer_id") || "";
  if (!customerId) return jsonError("customer_id requis");

  const { data } = await auth.supabase
    .from("crm_bookings")
    .select("id, reference, title, destination, status, start_date")
    .eq("customer_id", customerId)
    .order("start_date", { ascending: false, nullsFirst: false });

  const bookings = ((data || []) as Pick<
    CrmBooking,
    "id" | "reference" | "title" | "destination" | "status" | "start_date"
  >[]).map((b) => ({
    id: b.id,
    reference: b.reference,
    label: `${b.reference} — ${(b.title || b.destination || "Voyage").trim()}`,
    status: BOOKING_STATUS_LABELS[b.status] || b.status,
  }));
  return NextResponse.json({ bookings });
}
