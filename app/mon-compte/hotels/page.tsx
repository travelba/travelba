import { Suspense } from "react";
import { redirect } from "next/navigation";
import { HotelSearch } from "@/components/account/HotelSearch";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import { hotelSearchAllowed } from "@/lib/crm/hotel-search";

export default async function HotelsPage() {
  const { user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer || !hotelSearchAllowed(customer)) redirect("/mon-compte");

  return (
    <Suspense fallback={<div className="h-40 animate-pulse bg-[#0B192C]/10" aria-hidden />}>
      <HotelSearch />
    </Suspense>
  );
}
