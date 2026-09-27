import "server-only";

import {
  fetchLePublicHotel,
  leHotelIdFromItem,
  rowsFromHotelCatalog,
  type HotelContactRow,
  type LeHotelCatalog,
} from "@/lib/crm/hotel-contact";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export { peopleFromContactRows, rowsFromHotelCatalog, type HotelContactRow } from "@/lib/crm/hotel-contact";

async function writeContactsToHotelItems(
  admin: SupabaseClient,
  bookingId: string,
  catalog: LeHotelCatalog
) {
  if (catalog.hotel_id == null) return;
  const { data: items } = await admin
    .from("crm_booking_items")
    .select("id, details")
    .eq("booking_id", bookingId)
    .eq("kind", "hotel");
  for (const item of items || []) {
    const details = { ...((item.details || {}) as Record<string, unknown>) };
    const itemHotelId = leHotelIdFromItem({ details });
    if (itemHotelId != null && itemHotelId !== catalog.hotel_id) continue;
    details.le_hotel_id = catalog.hotel_id;
    if (catalog.contacts.length) details.hotel_contacts = catalog.contacts;
    if (catalog.country && !details.country) details.country = catalog.country;
    if (catalog.city && !details.city) details.city = catalog.city;
    if (catalog.hotel_name && !details.hotel_name) details.hotel_name = catalog.hotel_name;
    if (catalog.website && !details.website) details.website = catalog.website;
    if (catalog.email && !details.email) details.email = catalog.email;
    if (catalog.phone && !details.phone) details.phone = catalog.phone;
    if (!details.source_family) details.source_family = "little_emperors";
    await admin.from("crm_booking_items").update({ details }).eq("id", item.id);
  }
}

async function replaceContactRows(admin: SupabaseClient, hotelId: number, rows: HotelContactRow[]) {
  if (!rows.length) return;
  await admin.from("crm_hotel_contacts").delete().eq("le_hotel_id", hotelId).eq("source", "little_emperors");
  const { error } = await admin.from("crm_hotel_contacts").insert(rows);
  if (error) throw error;
}

/** Fetch du catalogue public + enregistrement idempotent. Échec réseau : l’import continue. */
export async function persistLittleEmperorsHotelContacts(opts: {
  hotelId: number;
  catalog?: LeHotelCatalog | null;
  crmBookingId?: string | null;
  admin?: SupabaseClient;
  fetchImpl?: typeof fetch;
}): Promise<LeHotelCatalog | null> {
  let catalog = opts.catalog ?? null;
  if (!catalog) {
    try {
      catalog = await fetchLePublicHotel(opts.hotelId, opts.fetchImpl);
    } catch {
      catalog = null;
    }
  }
  if (!catalog) return null;
  if (catalog.hotel_id == null) catalog = { ...catalog, hotel_id: opts.hotelId };
  const admin = opts.admin || createServiceClient();
  const rows = rowsFromHotelCatalog(catalog);
  if (rows.length) {
    try {
      await replaceContactRows(admin, catalog.hotel_id as number, rows);
    } catch {
      // L’import de la réservation ne dépend pas de cette table.
    }
  }
  if (opts.crmBookingId) {
    try {
      await writeContactsToHotelItems(admin, opts.crmBookingId, catalog);
    } catch {
      return catalog;
    }
  }
  return catalog;
}
