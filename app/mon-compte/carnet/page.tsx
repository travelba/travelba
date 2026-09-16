import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import type { CrmBooking } from "@/lib/crm/types";
import { isUpcomingBooking } from "@/lib/crm/money";

export default async function CarnetIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const { data } = await supabase
    .from("crm_bookings")
    .select("reference,end_date,start_date,status")
    .eq("customer_id", customer.id)
    .neq("status", "cancelled")
    .order("start_date", { ascending: true, nullsFirst: false });

  const nextTrip = ((data || []) as Pick<CrmBooking, "reference" | "end_date">[]).find((b) =>
    isUpcomingBooking(b.end_date)
  );
  redirect(nextTrip ? `/mon-compte/reservations/${nextTrip.reference}` : "/mon-compte/reservations");
}
