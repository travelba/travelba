import { ratehawkJson, staffOrResponse } from "@/lib/crm/ratehawk/http";
import { ratehawkDb } from "@/lib/crm/ratehawk/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await staffOrResponse();
  if (auth instanceof Response) return auth;
  const cert = auth.staff.role === "ratehawk_cert";
  const columns = cert
    ? "partner_order_id, status, status_reason, hotel_name, hid, checkin, checkout, residency, sell_amount, currency, environment, created_at"
    : "partner_order_id, status, status_reason, hotel_name, hid, checkin, checkout, residency, sell_amount, currency, net_amount, environment, created_at, crm_booking_id";
  try {
    const supabase = ratehawkDb();
    let query = supabase.from("crm_ratehawk_bookings").select(columns).order("created_at", { ascending: false }).limit(40);
    if (cert) query = query.eq("environment", "sandbox");
    const { data, error } = await query;
    if (error) return ratehawkJson({ orders: [], error: error.message });
    return ratehawkJson({ orders: data || [] });
  } catch {
    return ratehawkJson({ orders: [], error: "Le journal des réservations n’est pas encore en place." });
  }
}
