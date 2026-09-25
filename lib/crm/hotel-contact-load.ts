import "server-only";

import {
  applyStoredHotelSources,
  fillLeHotelDetails,
  leHotelIdFromItem,
  type StoredHotelSource,
} from "@/lib/crm/hotel-contact";
import { peopleFromContactRows, type HotelContactRow } from "@/lib/crm/hotel-contact";
import type { CrmBookingItem } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

function storedId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function groupContactRows(rows: HotelContactRow[]): StoredHotelSource[] {
  const byHotel = new Map<number, HotelContactRow[]>();
  for (const row of rows) {
    const list = byHotel.get(row.le_hotel_id) || [];
    list.push(row);
    byHotel.set(row.le_hotel_id, list);
  }
  return [...byHotel.entries()].map(([hotelId, group]) => {
    const first = group[0];
    return {
      hotel_id: hotelId,
      hotel_name: first.hotel_name,
      website: null,
      city: first.city,
      country: first.country,
      contacts: peopleFromContactRows(group),
    };
  });
}

/** Site (et contacts typés) déjà liés au dossier, puis détail hôtel si l’identifiant est connu. */
export async function loadHotelContacts(bookingId: string, items: CrmBookingItem[]) {
  if (!items.some((item) => item.kind === "hotel")) return items;
  let rows: StoredHotelSource[] = [];
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_le_bookings")
      .select("hotel_id, hotel_name, website, city, country")
      .eq("crm_booking_id", bookingId);
    const leRows = ((data || []) as {
      hotel_id?: unknown;
      hotel_name?: unknown;
      website?: unknown;
      city?: unknown;
      country?: unknown;
    }[]).map((row) => ({
      hotel_id: storedId(row.hotel_id),
      hotel_name: typeof row.hotel_name === "string" ? row.hotel_name : null,
      website: typeof row.website === "string" ? row.website : null,
      city: typeof row.city === "string" ? row.city : null,
      country: typeof row.country === "string" ? row.country : null,
    }));
    const hotelIds = [
      ...new Set(
        [
          ...leRows.map((row) => row.hotel_id),
          ...items.map(leHotelIdFromItem),
        ].filter((id): id is number => id != null)
      ),
    ];
    let contactRows: HotelContactRow[] = [];
    if (hotelIds.length) {
      const { data: contacts } = await admin
        .from("crm_hotel_contacts")
        .select("le_hotel_id, hotel_name, city, country, contact_type, last_name, first_name, email, phone, source")
        .in("le_hotel_id", hotelIds);
      contactRows = (contacts || []) as HotelContactRow[];
    }
    const fromTable = groupContactRows(contactRows);
    rows = leRows.map((row) => {
      const extra = fromTable.find((entry) => entry.hotel_id === row.hotel_id);
      return {
        ...row,
        city: extra?.city || row.city,
        country: extra?.country || row.country,
        contacts: extra?.contacts || [],
      };
    });
    for (const extra of fromTable) {
      if (!rows.some((row) => row.hotel_id === extra.hotel_id)) rows.push(extra);
    }
  } catch {
    rows = [];
  }
  return fillLeHotelDetails(applyStoredHotelSources(items, rows));
}
