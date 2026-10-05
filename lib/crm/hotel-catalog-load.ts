import "server-only";

import { applyMatchedCatalog, peopleFromContactRows, type HotelContactRow, type StoredHotelSource } from "@/lib/crm/hotel-contact";
import { matchHotelDirectory, type HotelDirectoryEntry } from "@/lib/crm/hotel-catalog";
import type { CrmBookingItem } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Db } from "@/lib/supabase/db";

type ContactDb = Db;

const DIRECTORY_TTL_MS = 10 * 60 * 1000;
const PAGE = 1000;

let directoryCache: { at: number; rows: HotelDirectoryEntry[] } | null = null;

async function loadDirectory(admin: ContactDb) {
  const now = Date.now();
  if (directoryCache && now - directoryCache.at < DIRECTORY_TTL_MS) return directoryCache.rows;
  const rows: HotelDirectoryEntry[] = [];
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await admin
      .from("crm_le_hotels")
      .select("le_hotel_id, hotel_name, city, country")
      .order("le_hotel_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data || [];
    for (const row of batch) {
      const id = typeof row.le_hotel_id === "number" ? row.le_hotel_id : Number(row.le_hotel_id);
      const name = typeof row.hotel_name === "string" ? row.hotel_name.trim() : "";
      if (!Number.isInteger(id) || id <= 0 || !name) continue;
      rows.push({
        hotel_id: id,
        hotel_name: name,
        city: typeof row.city === "string" ? row.city : "",
        country: typeof row.country === "string" ? row.country : "",
      });
    }
    if (batch.length < PAGE) break;
  }
  if (rows.length) directoryCache = { at: now, rows };
  return rows;
}

function sourcesFor(matches: HotelDirectoryEntry[], contactRows: HotelContactRow[]): StoredHotelSource[] {
  const byHotel = new Map<number, HotelContactRow[]>();
  for (const row of contactRows) {
    const list = byHotel.get(row.le_hotel_id) || [];
    list.push(row);
    byHotel.set(row.le_hotel_id, list);
  }
  return matches.map((hotel) => ({
    hotel_id: hotel.hotel_id,
    hotel_name: hotel.hotel_name,
    city: hotel.city,
    country: hotel.country,
    website: null,
    contacts: peopleFromContactRows(byHotel.get(hotel.hotel_id) || []),
  }));
}

/** Contacts du catalogue Little Emperors, en mémoire, sur les cartes hôtel reconnues. */
export async function attachLittleEmperorsCatalog(items: CrmBookingItem[], admin?: ContactDb) {
  if (!items.some((item) => item.kind === "hotel")) return items;
  try {
    const client = admin || createServiceClient();
    const directory = await loadDirectory(client);
    if (!directory.length) return items;
    const matches = items
      .map((item) => matchHotelDirectory(item, directory))
      .filter((row): row is HotelDirectoryEntry => Boolean(row));
    const ids = [...new Set(matches.map((row) => row.hotel_id))];
    if (!ids.length) return items;
    const { data, error } = await client
      .from("crm_hotel_contacts")
      .select("le_hotel_id, hotel_name, city, country, contact_type, last_name, first_name, email, phone, source")
      .in("le_hotel_id", ids);
    if (error) return items;
    return applyMatchedCatalog(items, sourcesFor(matches, (data || []) as HotelContactRow[]));
  } catch {
    return items;
  }
}
