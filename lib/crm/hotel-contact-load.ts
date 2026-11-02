import "server-only";

import { attachLittleEmperorsCatalog } from "@/lib/crm/hotel-catalog-load";
import { applyLeStayFacts, attachHotelGallery, pickLeStay, type LeStayFacts } from "@/lib/crm/hotel-gallery";
import {
  applyStoredHotelSources,
  fillLeHotelDetails,
  leHotelIdFromItem,
  type StoredHotelSource,
} from "@/lib/crm/hotel-contact";
import { peopleFromContactRows, type HotelContactRow } from "@/lib/crm/hotel-contact";
import { frenchLeBenefitLine } from "@/lib/crm/ingest-parse";
import { benefitsFromLeRaw } from "@/lib/crm/little-emperors";
import type { CrmBookingItem } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

function storedId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function textList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

function stayFromRow(row: Record<string, unknown>): LeStayFacts {
  return {
    hotel_id: storedId(row.hotel_id),
    confirmation_number: typeof row.confirmation_number === "string" ? row.confirmation_number : null,
    check_in: typeof row.check_in === "string" ? row.check_in : null,
    check_out: typeof row.check_out === "string" ? row.check_out : null,
    address: typeof row.address === "string" ? row.address : null,
    room_types: textList(row.room_types),
    conditions: textList(row.cancellation_policies),
    guest_names: textList(row.guest_names),
    benefits: benefitsFromLeRaw(row.raw).map((line) => frenchLeBenefitLine(line)).filter(Boolean),
  };
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

/** Catalogue (Milano = Milan) pour la fiche. L’admin affiche le roster ; l’interface client passe par withoutHotelRoster. */
export async function loadHotelContacts(bookingId: string, items: CrmBookingItem[]) {
  if (!items.some((item) => item.kind === "hotel")) return items;
  let rows: StoredHotelSource[] = [];
  let stays: LeStayFacts[] = [];
  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_le_bookings")
      .select(
        "hotel_id, hotel_name, website, city, country, address, confirmation_number, check_in, check_out, room_types, cancellation_policies, guest_names, raw"
      )
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
    stays = ((data || []) as Record<string, unknown>[]).map(stayFromRow);
  } catch {
    rows = [];
    stays = [];
  }
  const withContacts = await attachLittleEmperorsCatalog(
    await fillLeHotelDetails(applyStoredHotelSources(items, rows))
  );
  const withFacts = withContacts.map((item) => frenchBenefits(applyLeStayFacts(item, pickLeStay(item, stays))));
  return attachHotelGallery(withFacts);
}

function frenchBenefits(item: CrmBookingItem): CrmBookingItem {
  if (item.kind !== "hotel" || !Array.isArray(item.details?.included)) return item;
  const supplier = (item.supplier || "").toLowerCase();
  const family = item.details.source_family;
  const fromLe =
    family === "little_emperors" || supplier.includes("little emperor") || leHotelIdFromItem(item) != null;
  if (!fromLe) return item;
  const included = [
    ...new Set(
      item.details.included
        .map((line) => frenchLeBenefitLine(typeof line === "string" ? line : ""))
        .filter(Boolean)
    ),
  ];
  return { ...item, details: { ...item.details, included } };
}
