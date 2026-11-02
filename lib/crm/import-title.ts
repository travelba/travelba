import { cityPlaceKey } from "@/lib/crm/city-names";
import { tripCityPlan, type TripStep } from "@/lib/crm/layover";

export const MAX_IMPORT_CITIES = 3;
export const TITLE_REVIEW_MARK = "Titre à vérifier";

function partsOf(value: string) {
  return value
    .split(/\s*·\s*|\s+[-–]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mentions(value: string | null | undefined, labels: string[]) {
  const parts = partsOf(value || "");
  return labels.some((label) => {
    const key = cityPlaceKey(label);
    const folded = label.trim().toLowerCase();
    if (!folded) return false;
    return parts.some((part) => {
      if (part.toLowerCase() === folded) return true;
      const partKey = cityPlaceKey(part);
      return Boolean(key && partKey && key === partKey);
    });
  });
}

function isCustomTitle(title: string, known: string[]) {
  const parts = partsOf(title);
  if (!parts.length) return false;
  return parts.some((part) => {
    const key = cityPlaceKey(part);
    const knownHit = known.some((label) => {
      if (!label.trim()) return false;
      if (label.trim().toLowerCase() === part.toLowerCase()) return true;
      const labelKey = cityPlaceKey(label);
      return Boolean(key && labelKey && key === labelKey);
    });
    return !knownHit;
  });
}

/**
 * Après un import : villes de séjour seulement, sans domicile, sans escale, sans nom d’hôtel.
 * Trois villes au plus. Un nom choisi (« 40 ans ») reste. Au-delà, le titre est à vérifier.
 */
export function importTitleGuard(input: {
  title?: string | null;
  destination?: string | null;
  items: TripStep[];
}): { title: string; review: boolean } {
  const plan = tripCityPlan(input.items);
  const hotels = input.items
    .filter((item) => item.kind === "hotel")
    .flatMap((item) => [item.title || "", typeof item.details?.hotel_name === "string" ? item.details.hotel_name : ""])
    .map((value) => value.trim())
    .filter(Boolean);
  const blocked = new Set([...plan.origins, ...plan.layovers].map((city) => cityPlaceKey(city)).filter(Boolean));
  const hotelKeys = new Set(hotels.map((name) => cityPlaceKey(name)).filter(Boolean));
  const stay: string[] = [];
  const source = plan.destinations.length ? plan.destinations : plan.cities;
  for (const city of source) {
    const key = cityPlaceKey(city);
    if (!key || blocked.has(key) || hotelKeys.has(key)) continue;
    if (stay.some((existing) => cityPlaceKey(existing) === key)) continue;
    stay.push(city);
  }
  const current = (input.title || "").trim();
  const known = [...plan.cities, ...plan.destinations, ...plan.origins, ...plan.layovers, ...hotels];
  const review =
    stay.length > MAX_IMPORT_CITIES ||
    mentions(current, hotels) ||
    mentions(current, plan.origins) ||
    mentions(current, plan.layovers);
  if (current && isCustomTitle(current, known)) return { title: current, review };
  const kept = stay.slice(0, MAX_IMPORT_CITIES);
  if (kept.length) return { title: kept.join(" · "), review: review || stay.length > kept.length };
  const destination = (input.destination || "").trim();
  if (destination && !mentions(destination, hotels)) return { title: destination, review };
  return { title: current || "Voyage", review };
}
