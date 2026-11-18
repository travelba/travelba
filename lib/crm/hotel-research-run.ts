import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hotelRooms } from "@/lib/crm/carnet";
import { directoryMatchFor } from "@/lib/crm/hotel-catalog-load";
import { hotelCatalogFromLePayload, fetchLePublicHotelJson, peopleFromDetails } from "@/lib/crm/hotel-contact";
import { applyHotelPresentation, presentationFromLeHotel } from "@/lib/crm/hotel-gallery";
import { perplexityApiKey } from "@/lib/crm/hotel-research-key";
import {
  hotelPhotoPublicUrl,
  hotelPhotoStoragePath,
  hotelProfileKey,
  hotelResearchComplete,
  mergeHotelResearch,
  parseResearchJson,
  researchItemCity,
  researchItemName,
  reviewHotelResearch,
  type HotelResearchFields,
  type HotelResearchItem,
} from "@/lib/crm/hotel-research";
import { uploadCrmFile } from "@/lib/crm/files";
import { trySharp } from "@/lib/crm/sharp";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBookingItem } from "@/lib/crm/types";

const MODEL = "sonar-deep-research";
const MAX_ATTEMPTS = 3;
const RETRY_MS = 15 * 60 * 1000;
const LOCK_MS = 2 * 60 * 1000;

type CardRow = {
  id: string;
  kind: string | null;
  title: string | null;
  supplier: string | null;
  details: Record<string, unknown> | null;
  lifecycle: string | null;
  created_at?: string | null;
};

type ProfileRow = {
  id: string;
  status: string;
  attempts: number;
  searched_at: string | null;
  description: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  contacts: unknown;
  photos: unknown;
};

function asItem(row: CardRow): HotelResearchItem {
  return { kind: row.kind, title: row.title, supplier: row.supplier, details: row.details };
}

function attemptsOf(details: Record<string, unknown> | null) {
  const value = details?.hotel_research_attempts;
  return typeof value === "number" && value >= 0 ? value : 0;
}

function searchedAt(details: Record<string, unknown> | null) {
  const value = details?.hotel_research_at;
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

/** Après la réponse. Sans clé, rien ne part. */
export function scheduleHotelResearch() {
  if (!perplexityApiKey()) return;
  try {
    after(() => {
      void kickHotelResearch().catch(() => undefined);
    });
  } catch {
    // Hors d’une requête : le cron reprend la file.
  }
}

export async function kickHotelResearch(admin?: SupabaseClient) {
  const key = perplexityApiKey();
  if (!key) return { skipped: "no_key" as const, done: 0 };
  const db = admin || createServiceClient();
  const cards = await loadPending(db);
  const groups = groupCards(cards);
  if (!groups.length) return { skipped: null, done: 0 };
  await researchGroup(db, key, groups[0]);
  return { skipped: null, done: 1 };
}

async function loadPending(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, supplier, details, lifecycle, created_at")
    .eq("kind", "hotel")
    .or("details->>hotel_research.eq.attente,details->>hotel_research.eq.echec")
    .order("created_at", { ascending: true })
    .limit(40);
  if (error || !data) return [];
  const now = Date.now();
  return (data as CardRow[]).filter((row) => {
    if (row.lifecycle === "cancelled" || row.lifecycle === "superseded") return false;
    const details = row.details || {};
    if (details.hotel_research === "echec") {
      if (attemptsOf(details) >= MAX_ATTEMPTS) return false;
      if (now - searchedAt(details) < RETRY_MS) return false;
    }
    return true;
  });
}

function groupCards(cards: CardRow[]) {
  const groups = new Map<string, CardRow[]>();
  for (const card of cards) {
    const key = hotelProfileKey(researchItemName(asItem(card)), researchItemCity(asItem(card)));
    if (!key.name_key) continue;
    const id = `${key.name_key}\n${key.city_key}`;
    const list = groups.get(id) || [];
    list.push(card);
    groups.set(id, list);
  }
  return [...groups.values()];
}

async function researchGroup(admin: SupabaseClient, key: string, cards: CardRow[]) {
  const sample = asItem(cards[0]);
  const ready = cards.filter((card) => hotelResearchComplete(card.details));
  if (ready.length) {
    await writeCards(admin, ready, null, (card) => mergeHotelResearch(card.details || {}, null, "prete"));
  }
  const pending = cards.filter((card) => !hotelResearchComplete(card.details));
  if (!pending.length) return;

  const hit = await directoryMatchFor(sample as CrmBookingItem, admin).catch(() => null);
  if (hit) {
    const applied = await applyDirectoryHotel(admin, pending, hit.hotel_id);
    if (!applied) await markAttempt(admin, pending, "attente");
    return;
  }

  const profileKey = hotelProfileKey(researchItemName(sample), researchItemCity(sample));
  const profile = await loadProfile(admin, profileKey.name_key, profileKey.city_key);
  if (profile && (profile.status === "prete" || profile.status === "vide")) {
    await applyProfile(admin, pending, profile);
    return;
  }
  if (profile && Date.now() - Date.parse(profile.searched_at || "") < LOCK_MS && profile.status === "attente") return;
  if (profile && profile.attempts >= MAX_ATTEMPTS) {
    await writeStatus(admin, pending, "echec");
    return;
  }

  const claimed = await claimProfile(admin, profileKey, researchItemName(sample), researchItemCity(sample), profile);
  try {
    const found = await searchHotel(key, researchItemName(sample), researchItemCity(sample));
    const review = reviewHotelResearch({
      hotelName: researchItemName(sample),
      city: researchItemCity(sample),
      draft: found.draft,
      pages: found.pages,
    });
    if (review.outcome === "unverifiable") {
      await failProfile(admin, claimed.id, claimed.attempts);
      await markAttempt(admin, pending, claimed.attempts >= MAX_ATTEMPTS ? "echec" : "attente");
      return;
    }
    if (review.outcome === "nom" || review.outcome === "vide") {
      await saveProfile(admin, claimed.id, "vide", null, found.citations);
      await writeStatus(admin, pending, "vide");
      return;
    }
    const photos = await storePhotos(claimed.id, review.fields.photos);
    const fields = { ...review.fields, photos };
    const status = fields.description || fields.contacts.length || photos.length || fields.address || fields.website || fields.phone ? "prete" : "vide";
    await saveProfile(admin, claimed.id, status, status === "prete" ? fields : null, found.citations);
    for (const card of pending) {
      const next = mergeHotelResearch(card.details || {}, status === "prete" ? fields : null, status);
      await admin.from("crm_booking_items").update({ details: next }).eq("id", card.id);
    }
  } catch {
    await failProfile(admin, claimed.id, claimed.attempts);
    await markAttempt(admin, pending, claimed.attempts >= MAX_ATTEMPTS ? "echec" : "attente");
  }
}

async function applyDirectoryHotel(admin: SupabaseClient, cards: CardRow[], hotelId: number) {
  let payload: unknown = null;
  try {
    payload = await fetchLePublicHotelJson(hotelId);
  } catch {
    payload = null;
  }
  if (!payload) return false;
  const catalog = hotelCatalogFromLePayload(payload);
  for (const card of cards) {
    const details = { ...(card.details || {}) };
    if (catalog.contacts.length && !peopleFromDetails(details).length) details.hotel_contacts = catalog.contacts;
    if (catalog.city && !details.city) details.city = catalog.city;
    if (catalog.country && !details.country) details.country = catalog.country;
    if (catalog.website && !details.website) details.website = catalog.website;
    if (catalog.phone && !details.phone) details.phone = catalog.phone;
    if (!details.le_hotel_id) details.le_hotel_id = hotelId;
    const rooms = hotelRooms({ kind: "hotel", details } as CrmBookingItem).map((room) => room.room);
    const presented = applyHotelPresentation({ kind: "hotel", details }, presentationFromLeHotel(payload, rooms));
    presented.details.hotel_research = "prete";
    await admin.from("crm_booking_items").update({ details: presented.details }).eq("id", card.id);
  }
  return true;
}

async function loadProfile(admin: SupabaseClient, nameKey: string, cityKey: string) {
  const { data } = await admin
    .from("crm_hotel_profiles")
    .select("id, status, attempts, searched_at, description, address, website, phone, city, country, contacts, photos")
    .eq("name_key", nameKey)
    .eq("city_key", cityKey)
    .maybeSingle();
  return (data as ProfileRow | null) || null;
}

async function claimProfile(
  admin: SupabaseClient,
  key: { name_key: string; city_key: string },
  hotelName: string,
  city: string,
  current: ProfileRow | null
) {
  const attempts = (current?.attempts || 0) + 1;
  const row = {
    name_key: key.name_key,
    city_key: key.city_key,
    hotel_name: hotelName.slice(0, 180),
    city: city.slice(0, 80),
    status: "attente",
    attempts,
    searched_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("crm_hotel_profiles")
    .upsert(row, { onConflict: "name_key,city_key" })
    .select("id, attempts")
    .single();
  if (error || !data) throw error || new Error("fiche");
  return { id: String(data.id), attempts: Number(data.attempts || attempts) };
}

async function failProfile(admin: SupabaseClient, id: string, attempts: number) {
  await admin
    .from("crm_hotel_profiles")
    .update({ status: attempts >= MAX_ATTEMPTS ? "echec" : "attente", attempts })
    .eq("id", id);
}

async function saveProfile(
  admin: SupabaseClient,
  id: string,
  status: "prete" | "vide",
  fields: HotelResearchFields | null,
  citations: string[]
) {
  await admin
    .from("crm_hotel_profiles")
    .update({
      status,
      description: fields?.description || null,
      address: fields?.address || null,
      website: fields?.website || null,
      phone: fields?.phone || null,
      city: fields?.city || null,
      country: fields?.country || null,
      contacts: fields?.contacts || [],
      photos: fields?.photos || [],
      citations: citations.slice(0, 12),
    })
    .eq("id", id);
}

function applyProfile(admin: SupabaseClient, cards: CardRow[], profile: ProfileRow) {
  const fields: HotelResearchFields = {
    description: profile.description || "",
    address: profile.address || "",
    website: profile.website || "",
    phone: profile.phone || "",
    city: profile.city || "",
    country: profile.country || "",
    contacts: Array.isArray(profile.contacts) ? (profile.contacts as HotelResearchFields["contacts"]) : [],
    photos: storedProfilePhotos(profile.photos),
  };
  const status = profile.status === "prete" ? "prete" : "vide";
  return writeCards(
    admin,
    cards,
    null,
    (card) => mergeHotelResearch(card.details || {}, status === "prete" ? fields : null, status)
  );
}

function storedProfilePhotos(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as { url?: unknown; caption?: unknown };
      const url = typeof row.url === "string" ? row.url : "";
      if (!url.startsWith("/api/hotels/photos/")) return null;
      return { url, caption: typeof row.caption === "string" ? row.caption : "" };
    })
    .filter((row): row is { url: string; caption: string } => Boolean(row));
}

async function writeStatus(admin: SupabaseClient, cards: CardRow[], status: "vide" | "echec" | "prete") {
  for (const card of cards) {
    const details = { ...(card.details || {}), hotel_research: status };
    await admin.from("crm_booking_items").update({ details }).eq("id", card.id);
  }
}

async function writeCards(
  admin: SupabaseClient,
  cards: CardRow[],
  details: Record<string, unknown> | null,
  each?: (card: CardRow) => Record<string, unknown>
) {
  for (const card of cards) {
    const next = each ? each(card) : { ...(card.details || {}), ...(details || {}) };
    await admin.from("crm_booking_items").update({ details: next }).eq("id", card.id);
  }
}

async function markAttempt(admin: SupabaseClient, cards: CardRow[], status: "attente" | "echec") {
  const now = new Date().toISOString();
  for (const card of cards) {
    const details = card.details || {};
    const attempts = attemptsOf(details) + 1;
    await admin
      .from("crm_booking_items")
      .update({
        details: {
          ...details,
          hotel_research: status === "echec" || attempts >= MAX_ATTEMPTS ? "echec" : status,
          hotel_research_at: now,
          hotel_research_attempts: attempts,
        },
      })
      .eq("id", card.id);
  }
}

async function searchHotel(key: string, hotelName: string, city: string) {
  const response = await askPerplexity(key, hotelName, city, true);
  const used = response.status === 400 ? await askPerplexity(key, hotelName, city, false) : response;
  if (!used.ok) throw new Error(String(used.status));
  const payload = (await used.json()) as {
    citations?: unknown;
    search_results?: unknown;
    choices?: { message?: { content?: unknown } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  const draft = parseResearchJson(typeof content === "string" ? content : "");
  if (!draft) throw new Error("json");
  const citations = citationUrls(payload);
  const pages = await readPages(citations);
  return { draft, pages, citations };
}

async function askPerplexity(key: string, hotelName: string, city: string, schema: boolean) {
  const where = city ? `${hotelName}, ${city}` : hotelName;
  const body: Record<string, unknown> = {
    model: MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Tu établis la fiche publique d’un hôtel. Tu n’inventes rien : chaque e-mail, téléphone, adresse, site et photo est copié d’une page. La description est en français, deux à quatre phrases, sur l’établissement. Pas de prix, pas de condition d’annulation, pas ce qui est inclus dans une réservation. preuves : extraits courts copiés des pages, au moins un par fait. Réponds en JSON.",
      },
      {
        role: "user",
        content: `Hôtel « ${where} ». Contacts du concierge, des réservations et des autres bureaux nommés. Photos https de la façade et du hall d’abord.`,
      },
    ],
  };
  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "fiche_hotel", schema: RESEARCH_SCHEMA },
    };
  }
  return fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
}

function citationUrls(payload: { citations?: unknown; search_results?: unknown }) {
  const urls: string[] = [];
  if (Array.isArray(payload.citations)) {
    for (const entry of payload.citations) if (typeof entry === "string") urls.push(entry);
  }
  if (Array.isArray(payload.search_results)) {
    for (const entry of payload.search_results) {
      if (entry && typeof entry === "object" && typeof (entry as { url?: unknown }).url === "string") {
        urls.push((entry as { url: string }).url);
      }
    }
  }
  const seen = new Set<string>();
  return urls.filter((url) => {
    if (!url.startsWith("https://") || seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, 6);
}

async function readPages(urls: string[]) {
  const pages: { url: string; text: string }[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/html,text/plain", "User-Agent": "Travelba hotel fiche" },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      if (!response.ok) continue;
      const type = response.headers.get("content-type") || "";
      if (type && !type.includes("text") && !type.includes("json") && !type.includes("xml")) continue;
      const html = (await response.text()).slice(0, 200_000);
      const links = [...new Set(html.match(/https:\/\/[^\s"'<>\\]+/gi) || [])].slice(0, 40).join(" ");
      const text = `${links} ${html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")}`
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80_000);
      if (text.length > 40) pages.push({ url, text });
    } catch {
      // Une page illisible ne fabrique pas un contact.
    }
  }
  return pages;
}

async function storePhotos(profileId: string, photos: { url: string; caption: string }[]) {
  const stored: { url: string; caption: string }[] = [];
  for (const photo of photos) {
    if (stored.length >= 8) break;
    const bytes = await downloadImage(photo.url);
    if (!bytes) continue;
    const path = hotelPhotoStoragePath(profileId, stored.length);
    const pub = hotelPhotoPublicUrl(profileId, stored.length);
    if (!path || !pub) continue;
    try {
      await uploadCrmFile(path, bytes, "image/webp", { upsert: true });
      stored.push({ url: pub, caption: photo.caption });
    } catch {
      // La photo manquante ne bloque pas la fiche.
    }
  }
  return stored;
}

async function downloadImage(url: string) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return null;
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.length < 1000 || raw.length > 4_000_000) return null;
    const sharp = await trySharp();
    if (!sharp) return null;
    return await sharp(raw, { failOn: "none" }).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    return null;
  }
}

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    hotel_name: { type: "string" },
    city: { type: "string" },
    country: { type: "string" },
    description: { type: "string" },
    preuves: { type: "array", items: { type: "string" } },
    address: { type: "string" },
    website: { type: "string" },
    phone: { type: "string" },
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
        },
        required: ["type", "first_name", "last_name", "email", "phone"],
      },
    },
    photos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string" },
          caption: { type: "string" },
        },
        required: ["url", "caption"],
      },
    },
  },
  required: ["hotel_name", "city", "country", "description", "preuves", "address", "website", "phone", "contacts", "photos"],
};
