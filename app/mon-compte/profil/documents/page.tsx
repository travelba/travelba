import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { CustomerTripDocuments } from "@/components/crm/CustomerTripDocuments";
import type { CrmBooking, CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");
  const [{ data: documents }, { data: bookings }] = await Promise.all([
    supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
    supabase
      .from("crm_bookings")
      .select("*")
      .eq("customer_id", customer.id)
      .neq("status", "cancelled")
      .order("start_date", { ascending: false }),
  ]);
  const bookingRows = (bookings || []) as CrmBooking[];
  const { data: travelerRows } = bookingRows.length
    ? await supabase
        .from("crm_booking_travelers")
        .select("*")
        .in(
          "booking_id",
          bookingRows.map((item) => item.id)
        )
    : { data: [] as CrmBookingTraveler[] };

  return (
    <div className="space-y-4 px-5 pb-10">
      <ProfileSubnav />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Espace membre
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold text-[var(--admin-navy-deep)]">
          Pièces par voyage
        </h1>
        <p className="mt-1 text-sm text-muted">
          Chaque dossier a son passeport. Déposez-le depuis la réservation concernée.
        </p>
      </div>
      <CustomerTripDocuments
        variant="client"
        hrefForBooking={(booking) => `/mon-compte/reservations/${booking.reference}`}
        bookings={bookingRows}
        travelers={(travelerRows || []) as CrmBookingTraveler[]}
        documents={(documents || []) as CrmTravelDocument[]}
      />
    </div>
  );
}
