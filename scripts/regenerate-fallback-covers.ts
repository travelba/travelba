/**
 * Régénère l’image des dossiers dont la couverture est une photo de repli
 * (pays ou autre ville). Valmorel / TB-2026-0111 en fait partie.
 *
 *   npm run covers:fallback
 *   npm run covers:fallback -- TB-2026-0111
 *   npm run covers:fallback -- --force TB-2026-0111
 *   npm run covers:fallback -- --no-geo
 *
 * N’écrit pas les dossiers. Stocke le WebP dans public/covers et le bucket
 * covers/catalog. Sans --force, un fichier déjà là est laissé tel quel.
 */
import { loadEnvFile } from "node:process";
import { createServiceClient } from "../lib/supabase/admin";
import {
  fallbackCoverTargets,
  generatableArrivalPlaces,
  generatedCoverIdForPlace,
  type CoverPlaceItem,
  type FallbackCoverTarget,
} from "../lib/crm/covers";
import { geocodePlace, legacyNearestCover } from "../lib/crm/cover-geo";
import { cityCoverCached, ensureCityCover, rebuildCityCover } from "../lib/crm/cover-generate";
import { cityCoverAuthFailed } from "../lib/crm/cover-retouch";

try {
  loadEnvFile(".env.local");
} catch {
  /* variables déjà fournies par l’environnement */
}

type BookingRow = {
  id: string;
  reference: string | null;
  destination: string | null;
  title: string | null;
  cover_image_path: string | null;
};

type ItemRow = {
  booking_id: string;
  kind: string | null;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  sort_order: number | null;
  details: Record<string, unknown> | null;
};

function wanted(reference: string | null, id: string, refs: string[]) {
  if (!refs.length) return true;
  const values = [reference || "", id].map((value) => value.toLowerCase());
  return refs.some((ref) => values.includes(ref));
}

function countryHint(items: CoverPlaceItem[]) {
  const names = new Set<string>();
  for (const item of items) {
    const country = item.details?.country;
    if (typeof country === "string" && country.trim()) names.add(country.trim());
  }
  return names.size === 1 ? [...names][0] : "";
}

async function everyRow<T>(
  load: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const page = await load(from, from + size - 1);
    if (page.error) throw new Error(page.error.message);
    const chunk = page.data || [];
    rows.push(...chunk);
    if (chunk.length < size) return rows;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const geo = !args.includes("--no-geo");
  const refs = args.filter((arg) => arg && !arg.startsWith("--")).map((arg) => arg.toLowerCase());

  const admin = createServiceClient();
  const bookings = await everyRow<BookingRow>((from, to) =>
    admin
      .from("crm_bookings")
      .select("id, reference, destination, title, cover_image_path")
      .order("id")
      .range(from, to)
  );
  const chosen = bookings.filter(
    (row) => !row.cover_image_path && wanted(row.reference, row.id, refs)
  );
  const ids = chosen.map((row) => row.id);
  const items: ItemRow[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    if (!slice.length) continue;
    const page = await everyRow<ItemRow>((from, to) =>
      admin
        .from("crm_booking_items")
        .select("booking_id, kind, title, start_at, end_at, sort_order, details")
        .in("booking_id", slice)
        .order("id")
        .range(from, to)
    );
    items.push(...page);
  }
  const byBooking = new Map<string, CoverPlaceItem[]>();
  for (const item of items) {
    const list = byBooking.get(item.booking_id) || [];
    list.push(item);
    byBooking.set(item.booking_id, list);
  }

  const jobs = new Map<string, FallbackCoverTarget & { reference: string }>();
  for (const booking of chosen) {
    const stayItems = byBooking.get(booking.id) || [];
    const reference = booking.reference || booking.id;
    const coverBooking = { ...booking, title: booking.title || "" };
    for (const target of fallbackCoverTargets(coverBooking, { items: stayItems })) {
      jobs.set(target.generatedId, { ...target, reference });
    }
    if (!geo) continue;
    const hinted = countryHint(stayItems);
    for (const place of generatableArrivalPlaces(coverBooking, { items: stayItems })) {
      const generatedId = generatedCoverIdForPlace(place);
      if (!generatedId || jobs.has(generatedId)) continue;
      const query = hinted ? `${place}, ${hinted}` : place;
      const { hit } = await geocodePlace(query);
      if (!hit) continue;
      const legacy = legacyNearestCover(hit);
      if (!legacy || legacy === generatedId) continue;
      jobs.set(generatedId, { place, generatedId, fallbackPhoto: legacy, reference });
    }
  }

  let present = 0;
  let created = 0;
  let failed = 0;
  for (const job of jobs.values()) {
    if (!force && (await cityCoverCached(job.generatedId))) {
      present += 1;
      console.log("présent", job.reference, job.place);
      continue;
    }
    const bytes = force ? await rebuildCityCover(job.generatedId) : await ensureCityCover(job.generatedId);
    if (!bytes?.byteLength) {
      failed += 1;
      console.error("échec", job.reference, job.place);
      if (cityCoverAuthFailed()) {
        console.error("Clé image refusée. Le reste du lot n’est pas relancé.");
        break;
      }
      continue;
    }
    created += 1;
    console.log("générée", job.reference, job.place, job.fallbackPhoto);
  }

  console.log(
    `repli : ${created} générées, ${present} déjà là, ${failed} échecs, ${jobs.size} lieux`
  );
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "échec");
  process.exitCode = 1;
});
