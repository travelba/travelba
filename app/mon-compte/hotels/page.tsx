import { Suspense } from "react";
import { redirect } from "next/navigation";
import { HotelPlatinum } from "@/components/account/HotelPlatinum";
import { HotelSearch } from "@/components/account/HotelSearch";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import { hotelBookingEnabled, hotelDirectLive, hotelLeApiBooking, showHotelButton, showPlatinumScreen } from "@/lib/crm/hotel-access";
import { readHotelButtonVisibility, readPendingAccess } from "@/lib/crm/hotel-access-run";
import { clientPathSummary, recordCustomerActivity } from "@/lib/crm/customer-activity";

export default async function HotelsPage() {
  const { user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");
  const enabled = hotelBookingEnabled(customer);
  const visibility = await readHotelButtonVisibility();
  if (!showHotelButton({ enabled, visibility })) redirect("/mon-compte");
  await recordCustomerActivity({
    customerId: customer.id,
    authUserId: user.id,
    action: "view",
    summary: clientPathSummary("/mon-compte/hotels") || "A ouvert les hôtels",
    path: "/mon-compte/hotels",
  });
  if (showPlatinumScreen({ enabled, visibility })) {
    const pending = await readPendingAccess(customer.id);
    return <HotelPlatinum pending={Boolean(pending)} />;
  }

  return (
    <Suspense fallback={<div className="h-40 animate-pulse bg-[#0B192C]/10" aria-hidden />}>
      <HotelSearch trial={!hotelDirectLive(customer)} leApi={hotelLeApiBooking(customer)} />
    </Suspense>
  );
}
