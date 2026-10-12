import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { isUuid } from "@/lib/crm/ids";
import { bookingsForExpenseMatch, revolutBookingPickLabel } from "@/lib/crm/revolut-debit";
import { staffStayLabel } from "@/lib/crm/staff-stay";

export const runtime = "nodejs";

const COLUMNS =
  "id, reference, title, destination, customer_id, billing_customer_id, start_date, visible_to_client, archived_at";

type StayRow = {
  id: string;
  reference: string;
  title: string | null;
  destination: string | null;
  customer_id: string;
  billing_customer_id: string | null;
  start_date: string | null;
  visible_to_client: boolean | null;
  archived_at: string | null;
};

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const customerId = new URL(request.url).searchParams.get("customer_id") || "";
  if (!isUuid(customerId)) return jsonError("Client invalide");

  const [asTraveler, asPayer] = await Promise.all([
    auth.supabase.from("crm_bookings").select(COLUMNS).eq("customer_id", customerId),
    auth.supabase.from("crm_bookings").select(COLUMNS).eq("billing_customer_id", customerId),
  ]);
  if (asTraveler.error || asPayer.error) {
    console.error("[revolut/bookings]", asTraveler.error?.code || asPayer.error?.code || "?");
    return jsonError("Réservations indisponibles. Réessayez.", 500);
  }

  const bookings = bookingsForExpenseMatch(
    [...((asTraveler.data || []) as StayRow[]), ...((asPayer.data || []) as StayRow[])],
    customerId
  ).map((stay) => ({
    id: stay.id,
    reference: stay.reference,
    label: revolutBookingPickLabel(stay),
    status: staffStayLabel(stay),
  }));

  return NextResponse.json({ bookings });
}
