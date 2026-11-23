import { CITY_ALIASES } from "@/lib/crm/city-names";
import { PHOTOGRAPHED_CITIES } from "@/lib/crm/cover-coords";
import { foldHotelLabel } from "@/lib/crm/hotel-catalog";

/** Point du catalogue photo pour lancer une recherche de région sans attendre Little Emperors. */
export function coordsForPlace(destination: string, city: string): { lat: number; lng: number } | null {
  const head = foldHotelLabel((city || destination).split(",")[0] || "");
  if (!head) return null;
  const alias = CITY_ALIASES[head];
  const keys = new Set([head, alias].filter((value): value is string => Boolean(value)));
  const hit = PHOTOGRAPHED_CITIES.find((row) => keys.has(row.key));
  return hit ? { lat: hit.lat, lng: hit.lon } : null;
}
