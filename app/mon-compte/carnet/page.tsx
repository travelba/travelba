import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { isUpcomingBooking } from "@/lib/crm/money";
import { loadVisibleCarnets } from "@/lib/crm/carnet-query";

export default async function CarnetIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const trips = await loadVisibleCarnets(supabase, customer.id);
  const nextTrip = trips.find((b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled");
  redirect(nextTrip ? `/mon-compte/reservations/${nextTrip.reference}` : "/mon-compte/reservations");
}
