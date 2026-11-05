import "server-only";

import { frenchCity } from "@/lib/crm/hotel-fr";
import { storedHotelPhotos } from "@/lib/crm/hotel-gallery";
import { rankFeaturedHotels, type FeaturedHotel } from "@/lib/crm/hotel-search-home";
import { createServiceClient } from "@/lib/supabase/admin";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function hotelIdOf(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

/**
 * Coups de cœur : les hôtels les plus présents dans les séjours, avec leur photo.
 * Rien n’est inventé. Sans photo, la section reste cachée.
 */
export async function loadFeaturedHotels(): Promise<FeaturedHotel[]> {
  try {
    const db = createServiceClient();
    const { data, error } = await db.from("crm_booking_items").select("title, details").eq("kind", "hotel").limit(400);
    if (error || !data) return [];
    const rows = data.map((row) => {
      const details = asRecord(row.details);
      const named = typeof details.hotel_name === "string" ? details.hotel_name : "";
      const title = typeof row.title === "string" ? row.title : "";
      const photos = storedHotelPhotos(details);
      const photo = photos.find((item) => item.kind === "hotel")?.url || photos[0]?.url || "";
      return {
        name: named.trim() || title,
        city: typeof details.city === "string" ? frenchCity(details.city) : "",
        photo,
        hotelId: hotelIdOf(details.le_hotel_id),
      };
    });
    return rankFeaturedHotels(rows);
  } catch (error) {
    console.error("[hotel-highlights]", error instanceof Error ? error.message : "lecture");
    return [];
  }
}
