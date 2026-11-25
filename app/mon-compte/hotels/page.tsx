import { Suspense } from "react";
import { redirect } from "next/navigation";
import { HotelPlatinum } from "@/components/account/HotelPlatinum";
import { HotelSearch } from "@/components/account/HotelSearch";
import { HotelWait } from "@/components/account/HotelWait";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import { hotelBookingEnabled, hotelDirectLive, hotelLeApiBooking, showHotelButton, showPlatinumScreen } from "@/lib/crm/hotel-access";
import { readHotelButtonVisibility, readPendingAccess } from "@/lib/crm/hotel-access-run";
import { clientPathSummary, recordCustomerActivity } from "@/lib/crm/customer-activity";
import { clubUntilLabel } from "@/lib/crm/club-new-year";
import { loadFeaturedHotels } from "@/lib/crm/hotel-search-home-run";

export default async function HotelsPage() {
  const highlightsPromise = loadFeaturedHotels();
  const { user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");
  const enabled = hotelBookingEnabled(customer);
  const [visibility, highlights] = await Promise.all([
    readHotelButtonVisibility(),
    highlightsPromise,
    recordCustomerActivity({
      customerId: customer.id,
      authUserId: user.id,
      action: "view",
      summary: clientPathSummary("/mon-compte/hotels") || "A ouvert les hôtels",
      path: "/mon-compte/hotels",
    }),
  ]);
  if (!showHotelButton({ enabled, visibility })) redirect("/mon-compte");
  if (showPlatinumScreen({ enabled, visibility })) {
    const pending = await readPendingAccess(customer.id);
    return <HotelPlatinum pending={Boolean(pending)} />;
  }

  return (
    <Suspense fallback={<HotelWait />}>
      <HotelSearch
        trial={!hotelDirectLive(customer)}
        leApi={hotelLeApiBooking(customer)}
        customerId={customer.id}
        firstName={customer.first_name}
        lastName={customer.last_name}
        untilLabel={clubUntilLabel(customer.club_ends_on)}
        highlights={highlights}
      />
    </Suspense>
  );
}
