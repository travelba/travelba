import { HotelSearch } from "@/components/account/HotelSearch";
import { readExample } from "@/lib/crm/example-store";
import { loadFeaturedHotels } from "@/lib/crm/hotel-search-home-run";

export const dynamic = "force-dynamic";

/** Aperçu local de la recherche, même composant que /mon-compte/hotels. Fermé en production. */
export default async function ExampleHotelsPage() {
  const highlights = await loadFeaturedHotels();
  const { customer } = readExample();
  return (
    <HotelSearch
      customerId={customer.id}
      firstName={customer.first_name}
      lastName={customer.last_name}
      highlights={highlights}
      trial
    />
  );
}
