/**
 * Charge l'annuaire Little Emperors (export JSON) dans crm_le_hotels et crm_hotel_contacts.
 *
 *   node scripts/import-le-hotel-contacts.mjs /chemin/little-emperors-hotel-contacts-full.json
 *
 * Le fichier n'est pas versionné : il contient les e-mails des hôtels.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const path = resolve(process.cwd(), ".env.local");
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

const file = process.argv[2];
if (!file) {
  console.error("Indiquez le fichier JSON.");
  process.exit(1);
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase n'est pas configuré.");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(resolve(file), "utf8"));
const sourceRows = Array.isArray(payload.rows) ? payload.rows : [];
const hotels = new Map();
const contacts = new Map();

for (const row of sourceRows) {
  const hotelId = Number(row.hotel_id);
  if (!Number.isInteger(hotelId) || hotelId <= 0) continue;
  const hotelName = text(row.hotel_name);
  const city = text(row.city);
  const country = text(row.country);
  const current = hotels.get(hotelId) || { le_hotel_id: hotelId, hotel_name: "", city: "", country: "", source: "little_emperors" };
  if (hotelName && hotelName.length >= current.hotel_name.length) {
    current.hotel_name = hotelName;
    if (city) current.city = city;
    if (country) current.country = country;
  } else {
    if (!current.city && city) current.city = city;
    if (!current.country && country) current.country = country;
  }
  hotels.set(hotelId, current);

  const email = text(row.email);
  const contactType = text(row.contact_type);
  const lastName = text(row.last_name);
  const firstName = text(row.first_name);
  if (!email && !contactType && !lastName && !firstName) continue;
  const identity = [hotelId, email.toLowerCase(), contactType, lastName, firstName].join("\u0001");
  if (contacts.has(identity)) continue;
  contacts.set(identity, {
    le_hotel_id: hotelId,
    hotel_name: hotelName || null,
    city: city || null,
    country: country || null,
    contact_type: contactType || null,
    last_name: lastName || null,
    first_name: firstName || null,
    email: email || null,
    phone: null,
    source: "little_emperors",
  });
}

for (const contact of contacts.values()) {
  const hotel = hotels.get(contact.le_hotel_id);
  if (!hotel) continue;
  if (!contact.hotel_name) contact.hotel_name = hotel.hotel_name || null;
  if (!contact.city) contact.city = hotel.city || null;
  if (!contact.country) contact.country = hotel.country || null;
}

const directory = [...hotels.values()].filter((row) => row.hotel_name);
const namedIds = new Set(directory.map((row) => row.le_hotel_id));
const people = [...contacts.values()].filter((row) => namedIds.has(row.le_hotel_id));
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function chunks(rows, size, write) {
  for (let index = 0; index < rows.length; index += size) {
    const slice = rows.slice(index, index + size);
    const { error } = await write(slice);
    if (error) throw new Error(error.message);
  }
}

const { error: clearHotels } = await supabase.from("crm_le_hotels").delete().neq("le_hotel_id", 0);
if (clearHotels) throw new Error(clearHotels.message);
await chunks(directory, 500, (slice) => supabase.from("crm_le_hotels").insert(slice));

const ids = directory.map((row) => row.le_hotel_id);
for (let index = 0; index < ids.length; index += 200) {
  const slice = ids.slice(index, index + 200);
  const { error } = await supabase.from("crm_hotel_contacts").delete().in("le_hotel_id", slice).eq("source", "little_emperors");
  if (error) throw new Error(error.message);
}
await chunks(people, 400, (slice) => supabase.from("crm_hotel_contacts").insert(slice));

console.log(`hôtels ${directory.length}, contacts ${people.length}`);
