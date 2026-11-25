import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acceptHotelPhone,
  acceptHotelWebsite,
  acceptHttpsUrl,
  hotelCacheKey,
  hotelCityKey,
  hotelNameKey,
  hotelWebFactsUseful,
  type HotelDeskSlot,
  type HotelWebFacts,
} from "@/lib/crm/hotel-web";

export const HOTEL_PHOTO_BUCKET = "hotel-photos";
export const HOTEL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const HOTEL_PROFILE_ATTEMPT_CAP = 10;

export type HotelEmailStatus = "a_verifier" | "verifie";

export type HotelProfileContact = {
  email: string | null;
  phone: string | null;
  email_status: HotelEmailStatus | null;
};

export type HotelProfilePhoto = {
  path: string;
  url: string;
  caption: string;
};

export type HotelProfileContacts = {
  reception: HotelProfileContact;
  reservations: HotelProfileContact;
  concierge: HotelProfileContact;
};

export type HotelProfileStatus = "auto" | "verified";

export type HotelProfile = {
  id: string;
  name_key: string;
  city_key: string;
  hotel_name: string;
  city: string;
  country: string;
  address: string | null;
  website: string | null;
  description: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  contacts: HotelProfileContacts;
  photos: HotelProfilePhoto[];
  sources: string[];
  status: HotelProfileStatus;
  attempts: number;
  last_searched_at: string | null;
  last_verified_at: string | null;
};

export type HotelProfilePublic = {
  nom: string;
  ville: string;
  pays: string;
  adresse: string | null;
  site: string | null;
  description: string | null;
  heure_arrivee: string | null;
  heure_depart: string | null;
  contacts: HotelProfileContacts;
  photos: { chemin: string; url: string; legende: string }[];
  sources: string[];
  statut: HotelProfileStatus;
  statut_libelle: string;
  derniere_recherche: string | null;
  derniere_validation: string | null;
};

const ROLES = ["reception", "reservations", "concierge"] as const;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function emptyProfileContact(): HotelProfileContact {
  return { email: null, phone: null, email_status: null };
}

export function emptyProfileContacts(): HotelProfileContacts {
  return {
    reception: emptyProfileContact(),
    reservations: emptyProfileContact(),
    concierge: emptyProfileContact(),
  };
}

export function splitHotelKey(key: string) {
  const cut = key.indexOf("|");
  if (cut <= 0 || cut === key.length - 1) return null;
  return { name_key: key.slice(0, cut), city_key: key.slice(cut + 1) };
}

export function hotelProfileBadge(status: unknown): HotelProfileStatus | null {
  if (status === "verified" || status === "prete") return "verified";
  if (status === "auto" || status === "attente" || status === "vide" || status === "echec") return "auto";
  return null;
}

export function hotelProfileStatusLabel(status: HotelProfileStatus) {
  return status === "verified" ? "Vérifiée" : "À vérifier";
}

function emailStatus(value: unknown): HotelEmailStatus | null {
  if (value === "verifie" || value === "verified") return "verifie";
  if (value === "a_verifier" || value === "auto") return "a_verifier";
  return null;
}

function readContact(value: unknown): HotelProfileContact {
  const row = asRecord(value);
  if (!row) return emptyProfileContact();
  const email = text(row.email).toLowerCase() || null;
  const phone = acceptHotelPhone(row.phone) || text(row.phone) || null;
  return {
    email,
    phone: phone || null,
    email_status: email ? emailStatus(row.email_status) || "a_verifier" : null,
  };
}

function contactsFromUnknown(value: unknown): HotelProfileContacts {
  const contacts = emptyProfileContacts();
  const row = asRecord(value);
  if (row) {
    for (const role of ROLES) contacts[role] = readContact(row[role]);
    return contacts;
  }
  if (!Array.isArray(value)) return contacts;
  for (const entry of value) {
    const person = asRecord(entry);
    if (!person) continue;
    const roleName = text(person.type || person.role).toLowerCase();
    const role = roleName.includes("concierge")
      ? "concierge"
      : roleName.includes("reserv")
        ? "reservations"
        : roleName.includes("reception") || roleName.includes("front")
          ? "reception"
          : null;
    if (!role || contacts[role].email || contacts[role].phone) continue;
    contacts[role] = readContact(person);
  }
  return contacts;
}

function photosFromUnknown(value: unknown): HotelProfilePhoto[] {
  if (!Array.isArray(value)) return [];
  const photos: HotelProfilePhoto[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const url = acceptHttpsUrl(entry);
      if (url) photos.push({ path: "", url, caption: "" });
      continue;
    }
    const row = asRecord(entry);
    if (!row) continue;
    const url = acceptHttpsUrl(row.url);
    if (!url) continue;
    photos.push({
      path: text(row.path || row.chemin).slice(0, 240),
      url,
      caption: text(row.caption || row.legende).slice(0, 120),
    });
  }
  return photos;
}

function sourcesFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const url = acceptHttpsUrl(entry);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function normalizeStatus(value: unknown): HotelProfileStatus {
  return hotelProfileBadge(value) === "verified" ? "verified" : "auto";
}

export function hotelProfileFromRow(row: Record<string, unknown> | null | undefined): HotelProfile | null {
  if (!row) return null;
  const nameKey = text(row.name_key);
  const cityKey = text(row.city_key);
  if (!nameKey || !cityKey) return null;
  const sources = sourcesFromUnknown(row.sources);
  const citations = sourcesFromUnknown(row.citations);
  return {
    id: text(row.id),
    name_key: nameKey,
    city_key: cityKey,
    hotel_name: text(row.hotel_name),
    city: text(row.city),
    country: text(row.country),
    address: text(row.address) || null,
    website: acceptHotelWebsite(row.website) || null,
    description: text(row.description) || null,
    check_in_time: text(row.check_in_time) || null,
    check_out_time: text(row.check_out_time) || null,
    contacts: contactsFromUnknown(row.contacts),
    photos: photosFromUnknown(row.photos),
    sources: sources.length ? sources : citations,
    status: normalizeStatus(row.status),
    attempts: Number.isInteger(row.attempts) ? Number(row.attempts) : 0,
    last_searched_at: text(row.last_searched_at) || text(row.searched_at) || null,
    last_verified_at: text(row.last_verified_at) || null,
  };
}

export function factsFromHotelProfile(profile: HotelProfile | null): HotelWebFacts | null {
  if (!profile) return null;
  const slot = (contact: HotelProfileContact): HotelDeskSlot => ({
    phone: contact.phone,
    email: contact.email,
  });
  const facts: HotelWebFacts = {
    address: profile.address,
    website: profile.website,
    description: profile.description,
    check_in_time: profile.check_in_time,
    check_out_time: profile.check_out_time,
    reception: slot(profile.contacts.reception),
    reservations: slot(profile.contacts.reservations),
    concierge: slot(profile.contacts.concierge),
    photos: profile.photos.filter((photo) => photo.url).map((photo) => ({ url: photo.url, caption: photo.caption })),
    sources: profile.sources,
  };
  return hotelWebFactsUseful(facts) ? facts : null;
}

export function publicHotelProfile(profile: HotelProfile): HotelProfilePublic {
  return {
    nom: profile.hotel_name,
    ville: profile.city,
    pays: profile.country,
    adresse: profile.address,
    site: profile.website,
    description: profile.description,
    heure_arrivee: profile.check_in_time,
    heure_depart: profile.check_out_time,
    contacts: profile.contacts,
    photos: profile.photos.map((photo) => ({ chemin: photo.path, url: photo.url, legende: photo.caption })),
    sources: profile.sources,
    statut: profile.status,
    statut_libelle: hotelProfileStatusLabel(profile.status),
    derniere_recherche: profile.last_searched_at,
    derniere_validation: profile.last_verified_at,
  };
}

function keepContact(previous: HotelProfileContact, incoming: HotelDeskSlot): HotelProfileContact {
  const email = previous.email || incoming.email;
  const phone = previous.phone || incoming.phone;
  const freshEmail = !previous.email && Boolean(incoming.email);
  return {
    email: email || null,
    phone: phone || null,
    email_status: email ? (freshEmail ? "a_verifier" : previous.email_status || "a_verifier") : null,
  };
}

/** Ne remplit que les trous. Un e-mail nouveau reste « à vérifier ». */
export function mergeHotelProfile(
  current: HotelProfile | null,
  facts: HotelWebFacts,
  input: { name: string; city: string; country?: string; searched?: boolean; now?: string; key?: string }
): HotelProfile {
  const key = splitHotelKey(input.key || hotelCacheKey(input.name, input.city));
  const now = input.now || new Date().toISOString();
  const base = current;
  const contacts = emptyProfileContacts();
  let newEmail = false;
  for (const role of ROLES) {
    const previous = base?.contacts[role] || emptyProfileContact();
    contacts[role] = keepContact(previous, facts[role]);
    if (!previous.email && contacts[role].email) newEmail = true;
  }
  const photos = base?.photos.length ? base.photos : [];
  const sources = base?.sources.length ? base.sources : facts.sources;
  const status: HotelProfileStatus = !base || base.status !== "verified" || newEmail ? "auto" : "verified";
  return {
    id: base?.id || "",
    name_key: key?.name_key || hotelNameKey(input.name),
    city_key: key?.city_key || hotelCityKey(input.city),
    hotel_name: base?.hotel_name || input.name.slice(0, 180),
    city: base?.city || input.city.slice(0, 80),
    country: base?.country || text(input.country).slice(0, 80),
    address: base?.address || facts.address,
    website: base?.website || facts.website,
    description: base?.description || facts.description,
    check_in_time: base?.check_in_time || facts.check_in_time,
    check_out_time: base?.check_out_time || facts.check_out_time,
    contacts,
    photos,
    sources,
    status,
    attempts: Math.min(HOTEL_PROFILE_ATTEMPT_CAP, (base?.attempts || 0) + (input.searched ? 1 : 0)),
    last_searched_at: input.searched ? now : base?.last_searched_at || null,
    last_verified_at: base?.last_verified_at || null,
  };
}

export function verifyHotelProfile(profile: HotelProfile, now = new Date().toISOString()): HotelProfile {
  const contacts = emptyProfileContacts();
  for (const role of ROLES) {
    const current = profile.contacts[role];
    contacts[role] = {
      ...current,
      email_status: current.email ? "verifie" : null,
    };
  }
  return { ...profile, contacts, status: "verified", last_verified_at: now };
}

export function profileToRow(profile: HotelProfile, now = new Date().toISOString()) {
  return {
    name_key: profile.name_key,
    city_key: profile.city_key,
    hotel_name: profile.hotel_name.slice(0, 180),
    city: profile.city.slice(0, 80),
    country: profile.country.slice(0, 80),
    address: profile.address,
    website: profile.website,
    phone: profile.contacts.reception.phone,
    description: profile.description,
    check_in_time: profile.check_in_time,
    check_out_time: profile.check_out_time,
    contacts: profile.contacts,
    photos: profile.photos,
    sources: profile.sources,
    citations: profile.sources,
    status: profile.status,
    attempts: profile.attempts,
    searched_at: profile.last_searched_at,
    last_searched_at: profile.last_searched_at,
    last_verified_at: profile.last_verified_at,
    updated_at: now,
  };
}

function legacyProfileRow(row: Record<string, unknown>) {
  const next = { ...row };
  delete next.check_in_time;
  delete next.check_out_time;
  delete next.sources;
  delete next.last_searched_at;
  delete next.last_verified_at;
  if (next.status === "auto") next.status = "attente";
  if (next.status === "verified") next.status = "prete";
  return next;
}

function dbError(error: { code?: string; message?: string } | null) {
  return error?.code || "";
}

async function writeProfileRow(admin: SupabaseClient, row: Record<string, unknown>) {
  let payload = row;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const saved = await admin.from("crm_hotel_profiles").upsert(payload, { onConflict: "name_key,city_key" });
    if (!saved.error) return true;
    const code = dbError(saved.error);
    if (code === "42703" || /column .* does not exist/i.test(saved.error.message || "")) {
      payload = legacyProfileRow(payload);
      continue;
    }
    if (code === "23514" && payload.status === "auto") {
      payload = { ...payload, status: "attente" };
      continue;
    }
    if (code === "23514" && payload.status === "verified") {
      payload = { ...payload, status: "prete" };
      continue;
    }
    console.warn("[hotel-profile] fiche non écrite");
    return false;
  }
  console.warn("[hotel-profile] fiche non écrite");
  return false;
}

export async function readHotelProfile(admin: SupabaseClient, nameKey: string, cityKey: string) {
  const { data, error } = await admin
    .from("crm_hotel_profiles")
    .select("*")
    .eq("name_key", nameKey)
    .eq("city_key", cityKey)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    console.warn("[hotel-profile] lecture");
    return null;
  }
  return hotelProfileFromRow(data as Record<string, unknown> | null);
}

export async function saveHotelProfile(admin: SupabaseClient, profile: HotelProfile, now = new Date().toISOString()) {
  const photos = profile.photos.length ? profile.photos : [];
  return writeProfileRow(admin, profileToRow({ ...profile, photos }, now));
}

/** JPEG, PNG, WebP ou AVIF. Le SVG est refusé. */
export function sniffHotelImage(bytes: Uint8Array) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: "png", type: "image/png" };
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { ext: "webp", type: "image/webp" };
  }
  if (String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (brand === "avif" || brand === "avis") return { ext: "avif", type: "image/avif" };
  }
  return null;
}

export function hotelPhotoPublicUrl(supabaseUrl: string, path: string) {
  const base = supabaseUrl.replace(/\/$/, "");
  const encoded = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/storage/v1/object/public/${HOTEL_PHOTO_BUCKET}/${encoded}`;
}

function photoSlug(nameKey: string, cityKey: string) {
  const slug = `${nameKey}-${cityKey}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80);
  return slug || "hotel";
}

async function downloadImage(url: string, fetchImpl: FetchLike, hops = 0): Promise<Uint8Array | null> {
  const safe = acceptHttpsUrl(url);
  if (!safe || hops > 2) return null;
  const response = await fetchImpl(safe, { redirect: "manual", signal: AbortSignal.timeout(12_000) });
  if (response.status >= 300 && response.status < 400) {
    const next = response.headers.get("location");
    if (!next) return null;
    return downloadImage(new URL(next, safe).toString(), fetchImpl, hops + 1);
  }
  if (!response.ok) return null;
  const announced = Number(response.headers.get("content-length") || 0);
  if (announced > HOTEL_PHOTO_MAX_BYTES) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 32 || bytes.byteLength > HOTEL_PHOTO_MAX_BYTES) return null;
  return bytes;
}

export async function storeHotelPhotos(
  photos: { url: string; caption: string }[],
  nameKey: string,
  cityKey: string,
  opts: {
    admin: SupabaseClient;
    fetchImpl?: FetchLike;
    supabaseUrl?: string;
    cap?: number;
  }
): Promise<HotelProfilePhoto[]> {
  const supabaseUrl = (opts.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (!supabaseUrl || !photos.length) return [];
  const fetchImpl = opts.fetchImpl || fetch;
  const cap = opts.cap ?? 8;
  const stored: HotelProfilePhoto[] = [];
  const slug = photoSlug(nameKey, cityKey);
  for (const photo of photos) {
    if (stored.length >= cap) break;
    if (!acceptHttpsUrl(photo.url)) continue;
    try {
      const bytes = await downloadImage(photo.url, fetchImpl);
      if (!bytes) continue;
      const kind = sniffHotelImage(bytes);
      if (!kind) continue;
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
      const path = `${slug}/${hash}.${kind.ext}`;
      const uploaded = await opts.admin.storage.from(HOTEL_PHOTO_BUCKET).upload(path, bytes, {
        contentType: kind.type,
        upsert: true,
      });
      if (uploaded.error) continue;
      stored.push({
        path,
        url: hotelPhotoPublicUrl(supabaseUrl, path),
        caption: photo.caption.slice(0, 120),
      });
    } catch {
      continue;
    }
  }
  return stored;
}

/** Les photos distantes ne restent pas sur la fiche : seulement celles déposées dans le bucket. */
export function factsReadyForProfile(facts: HotelWebFacts, stored: HotelProfilePhoto[]): HotelWebFacts {
  if (!stored.length) return { ...facts, photos: [] };
  return {
    ...facts,
    photos: stored.map((photo) => ({ url: photo.url, caption: photo.caption })),
  };
}
