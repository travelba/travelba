import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { hotelSearchAllowed } from "@/lib/crm/hotel-search";
import { knownTravelerNames, travelerDisplayName, type NamedPerson } from "@/lib/crm/hotel-party";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelSearchAllowed(auth.customer)) return jsonError("Introuvable", 404);
  const self = travelerDisplayName(auth.customer);
  const [{ data: companions }, { data: travelers }] = await Promise.all([
    auth.supabase
      .from("crm_travel_companions")
      .select("first_name, last_name, usage_name")
      .eq("customer_id", auth.customer.id)
      .limit(40),
    auth.supabase.from("crm_booking_travelers").select("first_name, last_name").limit(80),
  ]);
  const people = knownTravelerNames(self, [
    ...((companions || []) as NamedPerson[]),
    ...((travelers || []) as NamedPerson[]),
  ]);
  return NextResponse.json({ self, people });
}
