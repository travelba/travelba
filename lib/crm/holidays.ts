import { countryIso, holidayDatesFromNager, nagerHolidayUrl } from "./hotel-arrival";

/**
 * Jours fériés du pays de l’hôtel pour l’année du check-in et la précédente (Nager.Date),
 * mémorisés par `pays:année` dans `cache`. Pays inconnu, année absente ou API muette : liste vide.
 */
export async function holidaysFor(
  country: string,
  checkIn: string,
  fetchImpl: typeof fetch,
  cache: Map<string, string[]>
) {
  const iso = countryIso(country);
  const year = Number((checkIn || "").slice(0, 4));
  if (!iso || !year) return [];
  const key = `${iso}:${year}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dates: string[] = [];
  for (const current of [year - 1, year]) {
    try {
      const res = await fetchImpl(nagerHolidayUrl(current, iso), { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      dates.push(...holidayDatesFromNager(await res.json()));
    } catch {
      continue;
    }
  }
  cache.set(key, dates);
  return dates;
}
