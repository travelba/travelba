import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { BOOKING_STATUS_LABELS, type BookingStatus, type CrmBooking } from "@/lib/crm/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const customerId = new URL(request.url).searchParams.get("customer_id") || "";
  if (!customerId) return jsonError("customer_id requis");

  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .select("id, reference, title, destination, status, start_date")
    .eq("customer_id", customerId)
    .order("start_date", { ascending: false, nullsFirst: false });
  // Une lecture en échec n’est pas « aucun voyage » : l’écran propose de réessayer.
  if (error) {
    console.error("[email-ingest/bookings]", error.code ?? "?", error.message ?? "");
    return jsonError("Voyages indisponibles. Réessayez.", 500);
  }

  const rows = (data || []) as Pick<
    CrmBooking,
    "id" | "reference" | "title" | "destination" | "status" | "start_date"
  >[];
  const ids = rows.map((row) => row.id);
  const itemsByBooking = new Map<
    string,
    { id: string; kind: string; title: string; confirmation_ref: string | null; lifecycle: string | null; amount: number | null }[]
  >();
  if (ids.length) {
    const { data: items, error: itemsError } = await auth.supabase
      .from("crm_booking_items")
      .select("id, booking_id, kind, title, confirmation_ref, lifecycle, amount")
      .in("booking_id", ids);
    if (itemsError) {
      console.error("[email-ingest/bookings]", itemsError.code ?? "?", itemsError.message ?? "");
      return jsonError("Voyages indisponibles. Réessayez.", 500);
    }
    for (const item of (items || []) as {
      id: string;
      booking_id: string;
      kind: string;
      title: string;
      confirmation_ref: string | null;
      lifecycle: string | null;
      amount: number | null;
    }[]) {
      const list = itemsByBooking.get(item.booking_id) || [];
      list.push({
        id: item.id,
        kind: item.kind,
        title: item.title,
        confirmation_ref: item.confirmation_ref,
        lifecycle: item.lifecycle,
        amount: item.amount,
      });
      itemsByBooking.set(item.booking_id, list);
    }
  }

  const bookings = rows.map((b) => ({
    id: b.id,
    reference: b.reference,
    label: `${b.reference} — ${(b.title || b.destination || "Voyage").trim()}`,
    status: BOOKING_STATUS_LABELS[b.status] || b.status,
    statusKey: b.status as BookingStatus,
    items: itemsByBooking.get(b.id) || [],
  }));
  return NextResponse.json({ bookings });
}
