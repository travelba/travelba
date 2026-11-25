import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { isUuid } from "@/lib/crm/ids";
import { bookingsForExpenseMatch, revolutBookingPickLabel } from "@/lib/crm/revolut-debit";
import { staffStayLabel } from "@/lib/crm/staff-stay";

export const runtime = "nodejs";

const COLUMNS =
  "id, reference, title, destination, customer_id, billing_customer_id, payer_kind, billing_company_id, status, start_date, visible_to_client, archived_at";

type StayRow = {
  id: string;
  reference: string;
  title: string | null;
  destination: string | null;
  customer_id: string;
  billing_customer_id: string | null;
  payer_kind: string | null;
  billing_company_id: string | null;
  status: string | null;
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

  const stays = bookingsForExpenseMatch(
    [...((asTraveler.data || []) as StayRow[]), ...((asPayer.data || []) as StayRow[])],
    customerId
  );
  const bookings = stays.map((stay) => ({
    id: stay.id,
    reference: stay.reference,
    label: revolutBookingPickLabel(stay),
    status: staffStayLabel(stay),
    payer_kind: stay.payer_kind,
    billing_company_id: stay.billing_company_id,
  }));
  const { data: companyRows } = await auth.supabase
    .from("crm_billing_companies")
    .select("id, company_name")
    .eq("customer_id", customerId)
    .order("sort_order");

  return NextResponse.json({
    bookings,
    companies: (companyRows || []) as { id: string; company_name: string | null }[],
  });
}
