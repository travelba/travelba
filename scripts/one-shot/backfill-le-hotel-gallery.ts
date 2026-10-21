/**
 * Pose l’identifiant Little Emperors et les photos de la catégorie réservée
 * sur les cartes hôtel déjà en base. Idempotent : un second passage n’écrit rien.
 *
 *   npx tsx scripts/one-shot/backfill-le-hotel-gallery.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { applyGalleryBackfill, galleryHotelCandidate, planGalleryBackfill, type GalleryStay } from "../../lib/crm/hotel-backfill";
import { presentationFromLeHotel } from "../../lib/crm/hotel-gallery";
import { frenchLeBenefitLine } from "../../lib/crm/ingest-parse";
import { benefitsFromLeRaw } from "../../lib/crm/little-emperors";
import type { CrmBookingItem } from "../../lib/crm/types";

function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

function textList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

function stayFromRow(row: Record<string, unknown>): GalleryStay | null {
  const hotelId = Number(row.hotel_id);
  const name = typeof row.hotel_name === "string" ? row.hotel_name.trim() : "";
  if (!Number.isInteger(hotelId) || hotelId <= 0 || !name) return null;
  return {
    hotel_id: hotelId,
    hotel_name: name,
    confirmation_number: typeof row.confirmation_number === "string" ? row.confirmation_number : null,
    check_in: typeof row.check_in === "string" ? row.check_in : null,
    check_out: typeof row.check_out === "string" ? row.check_out : null,
    room_types: textList(row.room_types),
    address: typeof row.address === "string" ? row.address : null,
    conditions: textList(row.cancellation_policies),
    benefits: benefitsFromLeRaw(row.raw).map((line) => frenchLeBenefitLine(line)).filter(Boolean),
  };
}

async function loadCatalog(hotelId: number) {
  const response = await fetch(`https://api.littleemperors.com/api/hotels/${hotelId}`, {
    headers: { Accept: "application/json", "App-Version": "Website" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { name?: unknown };
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) return null;
  return { name, payload };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase n'est pas configuré.");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const stays: GalleryStay[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await admin
      .from("crm_le_bookings")
      .select("hotel_id, hotel_name, confirmation_number, check_in, check_out, room_types, address, cancellation_policies, raw, state")
      .eq("state", "booked")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const stay = stayFromRow(row as Record<string, unknown>);
      if (stay) stays.push(stay);
    }
    if (!data || data.length < 1000) break;
  }

  const { data: itemRows, error: itemError } = await admin.from("crm_booking_items").select("*").eq("kind", "hotel");
  if (itemError) throw new Error(itemError.message);
  const items = (itemRows || []) as CrmBookingItem[];

  const catalogs = new Map<number, { name: string; payload: unknown } | null>();
  async function catalogFor(hotelId: number) {
    if (catalogs.has(hotelId)) return catalogs.get(hotelId) || null;
    try {
      const loaded = await loadCatalog(hotelId);
      catalogs.set(hotelId, loaded);
      return loaded;
    } catch {
      catalogs.set(hotelId, null);
      return null;
    }
  }

  const dry = process.env.DRY === "1";
  const report: { hotel: string; result: string; reason: string; photos: number; rooms: number }[] = [];
  let enriched = 0;
  let cleared = 0;
  let unchanged = 0;

  for (const item of items) {
    const hotel = (typeof item.details?.hotel_name === "string" && item.details.hotel_name) || item.title || "Hôtel";
    const candidate = galleryHotelCandidate(item, stays);
    const loaded = candidate ? await catalogFor(candidate) : null;
    const plan = planGalleryBackfill(item, stays, loaded ? { hotel_id: candidate || 0, name: loaded.name } : null);
    if (plan.action === "skip") {
      unchanged += 1;
      if (isLittleEmperors(item) || candidate) report.push({ hotel, result: "inchangée", reason: plan.reason, photos: 0, rooms: 0 });
      continue;
    }
    if (plan.action === "clear_id") {
      const applied = applyGalleryBackfill(item, plan, { photos: [], check_in_time: null, check_out_time: null, address: null });
      if (applied.changed) {
        if (!dry) {
          const { error } = await admin.from("crm_booking_items").update({ details: applied.item.details }).eq("id", item.id);
          if (error) throw new Error(error.message);
        }
        cleared += 1;
        report.push({ hotel, result: "identifiant retiré", reason: plan.reason, photos: 0, rooms: 0 });
      } else {
        unchanged += 1;
      }
      continue;
    }
    const presentation = loaded ? presentationFromLeHotel(loaded.payload, plan.roomNames) : { photos: [], check_in_time: null, check_out_time: null, address: null };
    const applied = applyGalleryBackfill(item, plan, presentation);
    const roomPhotos = presentation.photos.filter((photo) => photo.kind === "room").length;
    if (!applied.changed) {
      unchanged += 1;
      report.push({
        hotel,
        result: "déjà à jour",
        reason: roomPhotos ? plan.reason : "aucune photo de la catégorie, espaces seuls ou déjà posés",
        photos: presentation.photos.length,
        rooms: roomPhotos,
      });
      continue;
    }
    if (!dry) {
      const { error } = await admin.from("crm_booking_items").update({ details: applied.item.details }).eq("id", item.id);
      if (error) throw new Error(error.message);
    }
    enriched += 1;
    report.push({
      hotel,
      result: roomPhotos ? "enrichie" : "enrichie sans photo de chambre",
      reason: roomPhotos ? plan.reason : "aucune photo de cette catégorie dans le catalogue",
      photos: presentation.photos.length,
      rooms: roomPhotos,
    });
  }

  console.log(JSON.stringify({ simulation: dry, cartes: items.length, enrichies: enriched, identifiants_retirés: cleared, inchangées: unchanged, détail: report }, null, 2));
}

function isLittleEmperors(item: CrmBookingItem) {
  const family = item.details?.source_family;
  const supplier = (item.supplier || "").toLowerCase();
  return family === "little_emperors" || supplier.includes("little emperor");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Échec du rattrapage.");
  process.exit(1);
});
