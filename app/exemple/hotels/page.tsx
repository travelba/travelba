import { HotelSearch } from "@/components/account/HotelSearch";
import { loadFeaturedHotels } from "@/lib/crm/hotel-search-home-run";

export const dynamic = "force-dynamic";

/** Aperçu local de la recherche, même composant que /mon-compte/hotels. Fermé en production. */
export default async function ExampleHotelsPage() {
  const highlights = await loadFeaturedHotels();
  return <HotelSearch customerId="exemple-client" highlights={highlights} trial />;
}
