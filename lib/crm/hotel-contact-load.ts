import "server-only";

import { applyStoredHotelSources, fillLeHotelDetails, type StoredHotelSource } from "@/lib/crm/hotel-contact";
import type { CrmBookingItem } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

function storedId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

/** Site (et coordonnées) déjà liés au dossier, puis détail hôtel si l’identifiant est connu. */
export async function loadHotelContacts(bookingId: string, items: CrmBookingItem[]) {
  if (!items.some((item) => item.kind === "hotel")) return items;
  let rows: StoredHotelSource[] = [];
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_le_bookings")
      .select("hotel_id, hotel_name, website")
      .eq("crm_booking_id", bookingId);
    rows = ((data || []) as { hotel_id?: unknown; hotel_name?: unknown; website?: unknown }[]).map((row) => ({
      hotel_id: storedId(row.hotel_id),
      hotel_name: typeof row.hotel_name === "string" ? row.hotel_name : null,
      website: typeof row.website === "string" ? row.website : null,
    }));
  } catch {
    rows = [];
  }
  return fillLeHotelDetails(applyStoredHotelSources(items, rows));
}
