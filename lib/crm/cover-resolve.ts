import "server-only";

import { photoForUnknownPlace } from "@/lib/crm/cover-geo";
import {
  bookingCoverPlan,
  catalogCoverUrl,
  coverGeocodeQuery,
  type CoverBooking,
  type CoverPlaceItem,
} from "@/lib/crm/covers";

/** La liste n’attend pas Nominatim au-delà de ce délai. Le cache mémoire sert la fois d’après. */
const LIST_MATCH_BUDGET_MS = 4000;

export type ListCoverInput = {
  id: string;
  booking: CoverBooking;
  places?: string[];
  items?: CoverPlaceItem[];
};

/**
 * Photos que le catalogue local ne connaît pas, pour les vignettes d’une liste.
 * Le plan connu (ville, pays, import) reste calculé dans `BookingHero`.
 * Ici, seulement le géocodage, une fois, côté serveur.
 */
export async function resolveListCovers(rows: ListCoverInput[]): Promise<Record<string, string | null>> {
  const resolved: Record<string, string | null> = {};
  const pending: { query: string; ids: string[] }[] = [];
  const index = new Map<string, { query: string; ids: string[] }>();
  for (const row of rows) {
    const plan = bookingCoverPlan(row.booking, { places: row.places, items: row.items });
    if (plan.mode !== "none") continue;
    const query = coverGeocodeQuery(row.booking, { places: row.places, items: row.items });
    if (query.length < 2) {
      resolved[row.id] = null;
      continue;
    }
    const existing = index.get(query);
    if (existing) {
      existing.ids.push(row.id);
      continue;
    }
    const group = { query, ids: [row.id] };
    index.set(query, group);
    pending.push(group);
  }
  const deadline = Date.now() + LIST_MATCH_BUDGET_MS;
  for (const group of pending) {
    const left = deadline - Date.now();
    let photo: string | null = null;
    if (left > 0) {
      photo = await Promise.race([
        photoForUnknownPlace(group.query),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), left)),
      ]);
    }
    const src = photo ? catalogCoverUrl(photo) : null;
    for (const id of group.ids) resolved[id] = src;
  }
  return resolved;
}
