/**
 * Écrit l'annuaire Little Emperors sur chaque carte hôtel déjà en base,
 * passée ou à venir, et préremplit les destinataires des courriers non modifiés.
 *
 *   npx tsx scripts/one-shot/backfill-le-hotel-contacts.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { applyMatchedCatalog, hotelContact, peopleFromContactRows, type HotelContactRow, type StoredHotelSource } from "../../lib/crm/hotel-contact";
import type { HotelDirectoryEntry } from "../../lib/crm/hotel-catalog";
import { hotelDeskRecipients, keepAgencyDraft } from "../../lib/crm/hotel-desk";
import type { CrmBookingItem, CrmHotelRequest, HotelDeskKind } from "../../lib/crm/types";

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

function parisToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function stayWhen(item: CrmBookingItem, today: string) {
  const start = (item.start_at || "").slice(0, 10);
  const end = (item.end_at || item.start_at || "").slice(0, 10);
  if (end && end < today) return "past";
  if (start && start > today) return "future";
  return "current";
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase n'est pas configuré.");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const directory: HotelDirectoryEntry[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await admin
      .from("crm_le_hotels")
      .select("le_hotel_id, hotel_name, city, country")
      .order("le_hotel_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const id = Number(row.le_hotel_id);
      const name = typeof row.hotel_name === "string" ? row.hotel_name.trim() : "";
      if (!Number.isInteger(id) || id <= 0 || !name) continue;
      directory.push({
        hotel_id: id,
        hotel_name: name,
        city: typeof row.city === "string" ? row.city : "",
        country: typeof row.country === "string" ? row.country : "",
      });
    }
    if (!data || data.length < 1000) break;
  }

  const { data: itemRows, error: itemError } = await admin.from("crm_booking_items").select("*").eq("kind", "hotel");
  if (itemError) throw new Error(itemError.message);
  const items = (itemRows || []) as CrmBookingItem[];
  const { matchHotelDirectory } = await import("../../lib/crm/hotel-catalog");
  const matches = items
    .map((item) => matchHotelDirectory(item, directory))
    .filter((row): row is HotelDirectoryEntry => Boolean(row));
  const ids = [...new Set(matches.map((row) => row.hotel_id))];
  let contactRows: HotelContactRow[] = [];
  if (ids.length) {
    const { data, error } = await admin
      .from("crm_hotel_contacts")
      .select("le_hotel_id, hotel_name, city, country, contact_type, last_name, first_name, email, phone, source")
      .in("le_hotel_id", ids);
    if (error) throw new Error(error.message);
    contactRows = (data || []) as HotelContactRow[];
  }
  const byHotel = new Map<number, HotelContactRow[]>();
  for (const row of contactRows) {
    const list = byHotel.get(row.le_hotel_id) || [];
    list.push(row);
    byHotel.set(row.le_hotel_id, list);
  }
  const sources: StoredHotelSource[] = [...new Set(matches.map((row) => row.hotel_id))].map((hotelId) => {
    const hotel = directory.find((row) => row.hotel_id === hotelId);
    return {
      hotel_id: hotelId,
      hotel_name: hotel?.hotel_name || null,
      city: hotel?.city || null,
      country: hotel?.country || null,
      website: null,
      contacts: peopleFromContactRows(byHotel.get(hotelId) || []),
    };
  });
  const enriched = applyMatchedCatalog(items, sources);
  const today = parisToday();
  const counts = { past: 0, current: 0, future: 0, linked: 0, untouched: 0, letters: 0 };
  for (const item of enriched) {
    const when = stayWhen(item, today);
    counts[when] += 1;
  }

  for (let index = 0; index < items.length; index += 1) {
    const before = items[index];
    const after = enriched[index];
    if (JSON.stringify(before.details) === JSON.stringify(after.details)) {
      counts.untouched += 1;
    } else {
      const { error } = await admin.from("crm_booking_items").update({ details: after.details }).eq("id", after.id);
      if (error) throw new Error(error.message);
      counts.linked += 1;
    }
    const contact = hotelContact(after);
    if (!contact.people.length && !contact.email) continue;
    const { data: requests, error: requestError } = await admin
      .from("crm_hotel_requests")
      .select("id, kind, status, edited, recipients, subject, body")
      .eq("booking_item_id", after.id);
    if (requestError) throw new Error(requestError.message);
    for (const row of (requests || []) as Pick<CrmHotelRequest, "id" | "kind" | "status" | "edited" | "recipients" | "subject" | "body">[]) {
      const fresh = hotelDeskRecipients(contact, row.kind as HotelDeskKind);
      const kept = keepAgencyDraft(row, { subject: row.subject, body: row.body, recipients: fresh });
      const current = row.recipients || [];
      if (kept.recipients.join(",") === current.join(",")) continue;
      const { error: updateError } = await admin.from("crm_hotel_requests").update({ recipients: kept.recipients }).eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      counts.letters += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        cartes: items.length,
        reliées: counts.linked,
        inchangées: counts.untouched,
        passées: counts.past,
        en_cours: counts.current,
        à_venir: counts.future,
        courriers: counts.letters,
      },
      null,
      2
    )
  );
}

main();
