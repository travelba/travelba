import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLePublicHotelJson, hotelCatalogFromLePayload } from "@/lib/crm/hotel-contact";
import { presentationFromLeHotel } from "@/lib/crm/hotel-gallery";
import {
  foldHotelLabel,
  hotelMatchToken,
  hotelNameIsOnlyPlace,
  matchHotelLabel,
  supplierIsPrivateRental,
} from "@/lib/crm/hotel-catalog";
import {
  acceptHotelWebsite,
  emptyHotelWebFacts,
  factsFromCatalogueContacts,
  factsFromCatalogueHotel,
  hotelCacheKey,
  hotelNameKey,
  hotelSearchIdentity,
  hotelWebGaps,
  loadPerplexityHotel,
  mergeHotelWebFacts,
  HOTEL_WEB_REVIEW_REASON,
  officialSiteHost,
  parseHotelWebPayload,
  PERPLEXITY_HOTEL_MODEL,
  pickCatalogueHotel,
  ratehawkRowAgrees,
  realLeHotelId,
  shouldAutoEnrichHotel,
  type CatalogueContactRow,
  type CatalogueHotelRow,
  type HotelWebFacts,
  type HotelWebItem,
} from "@/lib/crm/hotel-web";
import {
  factsFromHotelProfile,
  factsReadyForProfile,
  mergeHotelProfile,
  publicHotelProfile,
  readHotelProfile,
  saveHotelProfile,
  splitHotelKey,
  storeHotelPhotos,
  verifyHotelProfile,
  type HotelProfile,
  type HotelProfilePublic,
} from "@/lib/crm/hotel-profile";

export type HotelWebStatus =
  | "complete"
  | "ignore"
  | "cle_absente"
  | "deja_complet"
  | "ville_absente"
  | "introuvable"
  | "pas_hotel"
  | "reponse_invalide";

export type HotelWebRunResult = {
  ok: boolean;
  statut: HotelWebStatus;
  rempli: string[];
  cache: boolean;
  depuis_fiche: boolean;
  modele: string | null;
  message: string;
  fiche: HotelProfilePublic | null;
};

type ItemRow = HotelWebItem & {
  id: string;
  booking_id?: string;
  details: Record<string, unknown> | null;
};

type FetchLike = typeof fetch;

function messageFor(statut: HotelWebStatus, filled: string[], depuisFiche: boolean) {
  if (statut === "deja_complet") return "Tous les champs sont déjà renseignés.";
  if (statut === "cle_absente") {
    return filled.length
      ? `Champs complétés : ${filled.join(", ")}. Recherche web non lancée : clé Perplexity absente.`
      : "Recherche non lancée : clé Perplexity absente.";
  }
  if (statut === "ville_absente") return "Indiquez la ville de l’hôtel.";
  if (statut === "introuvable") return "Carte introuvable.";
  if (statut === "pas_hotel") return "Ce n’est pas une carte hôtel.";
  if (statut === "ignore") return "Cette carte a déjà les informations de l’hôtel.";
  if (statut === "reponse_invalide") return "La recherche n’a pas donné d’informations utilisables.";
  if (filled.length && depuisFiche) return `Champs complétés depuis la fiche : ${filled.join(", ")}.`;
  if (filled.length) return `Champs complétés : ${filled.join(", ")}. À vérifier.`;
  return "Aucun champ vide n’a été trouvé.";
}

function result(
  statut: HotelWebStatus,
  filled: string[] = [],
  extra?: Partial<HotelWebRunResult>
): HotelWebRunResult {
  const depuisFiche = extra?.depuis_fiche === true;
  return {
    ok: statut === "complete" || statut === "deja_complet" || statut === "ignore",
    statut,
    rempli: filled,
    cache: extra?.cache === true,
    depuis_fiche: depuisFiche,
    modele: extra?.modele || null,
    fiche: extra?.fiche || null,
    message: extra?.message || messageFor(statut, filled, depuisFiche),
  };
}

async function loadItem(admin: SupabaseClient, itemId: string): Promise<ItemRow | null> {
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("id, booking_id, kind, title, supplier, lifecycle, details")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ItemRow;
}

function likeToken(name: string) {
  const token = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .find((part) => part.length > 3);
  return token ? token.replace(/[%_\\]/g, "") : "";
}

const LITTLE_MESSAGE = "Informations Little Emperors. Aucune recherche web.";

type LeHotelHit = {
  le_hotel_id: number;
  hotel_name: string;
  city: string;
  country: string;
};

function leHotelHit(row: { le_hotel_id?: unknown; hotel_name?: unknown; city?: unknown; country?: unknown }): LeHotelHit | null {
  const id = typeof row.le_hotel_id === "number" ? row.le_hotel_id : Number(row.le_hotel_id);
  const name = typeof row.hotel_name === "string" ? row.hotel_name.trim() : "";
  if (!Number.isInteger(id) || id <= 0 || !name) return null;
  return {
    le_hotel_id: id,
    hotel_name: name,
    city: typeof row.city === "string" ? row.city : "",
    country: typeof row.country === "string" ? row.country : "",
  };
}

async function listLittleHotels(admin: SupabaseClient, token: string) {
  const rows: LeHotelHit[] = [];
  for (let from = 0; from < 1000; from += 100) {
    const listed = await admin
      .from("crm_le_hotels")
      .select("le_hotel_id, hotel_name, city, country")
      .ilike("hotel_name", `%${token}%`)
      .order("le_hotel_id", { ascending: true })
      .range(from, from + 99);
    if (listed.error || !listed.data) break;
    const batch = listed.data as { le_hotel_id?: unknown; hotel_name?: unknown; city?: unknown; country?: unknown }[];
    for (const row of batch) {
      const hit = leHotelHit(row);
      if (hit) rows.push(hit);
    }
    if (batch.length < 100) break;
  }
  return rows;
}

/** Correspondance souple avec une seule fiche Little Emperors. N’écrit rien. */
export async function littleEmperorsCatalogMatch(admin: SupabaseClient, name: string, city: string, country = "") {
  const token = hotelMatchToken(name, city).replace(/[%_\\]/g, "");
  if (!token || !city) return null;
  const rows = await listLittleHotels(admin, token);
  const match = matchHotelLabel(
    { name, city, country },
    rows.map((row) => ({ ...row, name: row.hotel_name }))
  );
  return match;
}

async function readWebCache(admin: SupabaseClient, key: string, itemId: string): Promise<HotelWebFacts | null> {
  const stored = await admin.from("crm_hotel_web_profiles").select("payload").eq("cache_key", key).maybeSingle();
  if (!stored.error && stored.data?.payload) {
    const parsed = parseHotelWebPayload(stored.data.payload);
    if ("facts" in parsed) return parsed.facts;
  }
  const siblings = await admin
    .from("crm_booking_items")
    .select("id, details")
    .eq("kind", "hotel")
    .contains("details", { web_cache_key: key })
    .limit(5);
  if (siblings.error || !siblings.data) return null;
  for (const row of siblings.data) {
    if (row.id === itemId) continue;
    const details = row.details && typeof row.details === "object" ? (row.details as Record<string, unknown>) : null;
    const parsed = parseHotelWebPayload(details?.web_facts);
    if ("facts" in parsed) return parsed.facts;
  }
  return null;
}

async function writeWebCache(admin: SupabaseClient, key: string, name: string, city: string, facts: HotelWebFacts) {
  const { error } = await admin.from("crm_hotel_web_profiles").upsert({
    cache_key: key,
    hotel_name: name.slice(0, 180),
    city: city.slice(0, 80),
    payload: facts,
    model: PERPLEXITY_HOTEL_MODEL,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[hotel-web] cache non écrit");
}

async function catalogueFacts(admin: SupabaseClient, item: ItemRow, name: string, city: string) {
  const details = item.details || {};
  let hotel: CatalogueHotelRow | null = null;
  const hid = Number(details.hid);
  if (Number.isInteger(hid) && hid > 0) {
    const byId = await admin
      .from("crm_ratehawk_hotels")
      .select("name, address, region_name, check_in_time, check_out_time, images")
      .eq("hid", hid)
      .maybeSingle();
    const row = byId.data as CatalogueHotelRow | null;
    if (row && ratehawkRowAgrees(name, row.name || "")) hotel = row;
  }
  const token = likeToken(name);
  if (!hotel && token) {
    const listed = await admin
      .from("crm_ratehawk_hotels")
      .select("name, address, region_name, check_in_time, check_out_time, images")
      .ilike("name", `%${token}%`)
      .limit(15);
    hotel = pickCatalogueHotel((listed.data || []) as CatalogueHotelRow[], name, city);
  }
  return {
    hotel: factsFromCatalogueHotel(hotel),
    contacts: null as HotelWebFacts | null,
  };
}

async function searchCity(admin: SupabaseClient, item: ItemRow, name: string, city: string) {
  if (city) return city;
  const hid = Number(item.details?.hid);
  if (!Number.isInteger(hid) || hid <= 0) return "";
  const byId = await admin.from("crm_ratehawk_hotels").select("name, region_name").eq("hid", hid).maybeSingle();
  const row = byId.data as { name?: string | null; region_name?: string | null } | null;
  if (!row || !ratehawkRowAgrees(name, row.name || "")) return "";
  return typeof row.region_name === "string" ? row.region_name.trim() : "";
}

function countryOf(details: Record<string, unknown> | null | undefined) {
  const value = details?.country;
  return typeof value === "string" ? value.trim() : "";
}

async function rememberProfile(
  admin: SupabaseClient,
  current: HotelProfile | null,
  facts: HotelWebFacts,
  input: { name: string; city: string; country: string; searched: boolean; fetchImpl?: FetchLike; supabaseUrl?: string }
) {
  const parts = splitHotelKey(hotelCacheKey(input.name, input.city));
  if (!parts) return current;
  let storedPhotos = current?.photos || [];
  if (!storedPhotos.length && facts.photos.length) {
    storedPhotos = await storeHotelPhotos(facts.photos, parts.name_key, parts.city_key, {
      admin,
      fetchImpl: input.fetchImpl,
      supabaseUrl: input.supabaseUrl,
    });
  }
  const ready = factsReadyForProfile(facts, storedPhotos);
  const next = mergeHotelProfile(current, ready, {
    name: input.name,
    city: input.city,
    country: input.country,
    searched: input.searched,
  });
  if (storedPhotos.length && !next.photos.length) next.photos = storedPhotos;
  await saveHotelProfile(admin, next);
  const saved = await readHotelProfile(admin, parts.name_key, parts.city_key);
  return saved || next;
}

function unwrapLeHotel(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const data = row.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    if ("name" in nested || "images_gallery" in nested || "description" in nested) return nested;
  }
  return row;
}

function usableDescription(value: unknown) {
  const description = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (description.length < 40 || description.length > 700) return null;
  if (/https?:|<|>/.test(description)) return null;
  if (!description.includes(" ")) return null;
  return description;
}

function roomNamesOf(details: Record<string, unknown>) {
  const names: string[] = [];
  if (typeof details.room === "string" && details.room.trim()) names.push(details.room.trim());
  const rooms = Array.isArray(details.rooms) ? details.rooms : [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const row = room as { type?: unknown; room?: unknown };
    const type = typeof row.type === "string" ? row.type.trim() : "";
    const label = typeof row.room === "string" ? row.room.trim() : "";
    if (type) names.push(type);
    else if (label) names.push(label);
  }
  return names;
}

function cardHasPhotos(details: Record<string, unknown>) {
  const raw = details.photos;
  return Array.isArray(raw) && raw.length > 0;
}

async function resolveLittleHotel(admin: SupabaseClient, item: ItemRow, name: string, city: string) {
  const known = realLeHotelId(item.details);
  if (known) {
    const byId = await admin
      .from("crm_le_hotels")
      .select("le_hotel_id, hotel_name, city, country")
      .eq("le_hotel_id", Number(known))
      .maybeSingle();
    const hit = byId.data ? leHotelHit(byId.data as { le_hotel_id?: unknown; hotel_name?: unknown }) : null;
    if (hit) return hit;
    return {
      le_hotel_id: Number(known),
      hotel_name: name,
      city,
      country: countryOf(item.details),
    } satisfies LeHotelHit;
  }
  if (!name || !city) return null;
  return littleEmperorsCatalogMatch(admin, name, city, countryOf(item.details));
}

/**
 * Reprend contacts, photos et description Little Emperors.
 * N’appelle pas Perplexity et n’écrit pas `le_hotel_id` s’il n’était pas déjà sur la carte.
 */
async function applyLittleHotel(
  admin: SupabaseClient,
  item: ItemRow,
  hotel: LeHotelHit,
  fetchImpl?: FetchLike
): Promise<HotelWebRunResult> {
  const people = await admin
    .from("crm_hotel_contacts")
    .select("contact_type, email, phone")
    .eq("le_hotel_id", hotel.le_hotel_id);
  const stored = ((people.data || []) as CatalogueContactRow[]).map((row) => ({
    contact_type: row.contact_type,
    email: row.email,
    phone: row.phone,
  }));
  let payload: unknown = null;
  try {
    payload = await fetchLePublicHotelJson(hotel.le_hotel_id, fetchImpl);
  } catch {
    payload = null;
  }
  const body = unwrapLeHotel(payload);
  const catalog = body ? hotelCatalogFromLePayload(body) : null;
  const fromPayload = (catalog?.contacts || []).map((person) => ({
    contact_type: person.type,
    email: person.email,
    phone: person.phone,
  }));
  const contactFacts = factsFromCatalogueContacts([...stored, ...fromPayload], hotel.hotel_name, hotel.city);
  const presentation = body ? presentationFromLeHotel(body, roomNamesOf(item.details || {})) : null;
  const facts = emptyHotelWebFacts();
  if (contactFacts) {
    facts.reception = contactFacts.reception;
    facts.reservations = contactFacts.reservations;
    facts.concierge = contactFacts.concierge;
  }
  facts.description = usableDescription(body?.description);
  facts.address = presentation?.address || null;
  facts.check_in_time = presentation?.check_in_time || null;
  facts.check_out_time = presentation?.check_out_time || null;
  facts.website = acceptHotelWebsite(body?.website) || null;
  let details = { ...(item.details || {}) };
  const merged = mergeHotelWebFacts(details, facts, { markReview: false });
  details = merged.details;
  const filled = [...merged.filled];
  let changed = merged.changed;
  if (!cardHasPhotos(details) && presentation?.photos.length) {
    details.photos = presentation.photos;
    if (!filled.includes("photos")) filled.push("photos");
    changed = true;
  }
  if (changed) await admin.from("crm_booking_items").update({ details }).eq("id", item.id);
  return result(filled.length ? "complete" : "ignore", filled, { message: LITTLE_MESSAGE });
}

/**
 * Complète une carte hôtel. N’écrit que `details` : la visibilité reste celle de la carte.
 * Little Emperors d’abord (identifiant ou correspondance). Sinon la fiche, puis Perplexity.
 * Aucun e-mail n’est envoyé.
 */
export async function runHotelEnrichment(
  admin: SupabaseClient,
  itemId: string,
  opts?: { force?: boolean; env?: Record<string, string | undefined>; fetchImpl?: FetchLike }
): Promise<HotelWebRunResult> {
  const item = await loadItem(admin, itemId);
  if (!item) return result("introuvable");
  if (item.kind !== "hotel") return result("pas_hotel");
  if (item.lifecycle === "cancelled" || item.lifecycle === "superseded") return result("ignore");
  const identity = hotelSearchIdentity(item);
  const name = identity.name;
  const cityHint = await searchCity(admin, item, name, identity.city);
  const little = await resolveLittleHotel(admin, item, name, cityHint || identity.city);
  if (little) return applyLittleHotel(admin, item, little, opts?.fetchImpl);
  if (!opts?.force && !shouldAutoEnrichHotel(item)) {
    if (!hotelWebGaps(item.details).length) return result("deja_complet");
    return result("ville_absente");
  }
  const city = cityHint;
  const key = identity.key || hotelCacheKey(name, city);
  if (!name || !city || !key) return result("ville_absente");
  if (!hotelWebGaps(item.details).length) return result("deja_complet");

  const parts = splitHotelKey(key);
  const catalogue = await catalogueFacts(admin, item, name, city);

  let profile = parts ? await readHotelProfile(admin, parts.name_key, parts.city_key) : null;
  let profileFacts = factsFromHotelProfile(profile);
  const preview = [catalogue.hotel, catalogue.contacts, profileFacts].reduce<Record<string, unknown>>(
    (details, facts) => (facts ? mergeHotelWebFacts(details, facts, { markReview: false }).details : details),
    { ...(item.details || {}) }
  );

  let fromCache = false;
  let fromProfile = Boolean(profileFacts);
  let webFacts: HotelWebFacts | null = null;
  let model: string | null = null;
  let webError: "cle_absente" | "reponse_invalide" | null = null;
  const gapsAfterProfile = hotelWebGaps(preview);
  if (opts?.force || gapsAfterProfile.length) {
    if (!opts?.force) {
      webFacts = await readWebCache(admin, key, itemId);
      fromCache = Boolean(webFacts);
    }
    if (!webFacts) {
      const loaded = await loadPerplexityHotel(name, city, { env: opts?.env, fetchImpl: opts?.fetchImpl });
      if ("error" in loaded) webError = loaded.error === "cle_absente" ? "cle_absente" : "reponse_invalide";
      else {
        webFacts = loaded.facts;
        model = loaded.model;
        await writeWebCache(admin, key, name, city, loaded.facts);
      }
    }
  }

  if (webFacts) {
    profile = await rememberProfile(admin, profile, webFacts, {
      name,
      city,
      country: countryOf(item.details),
      searched: !fromCache,
      fetchImpl: opts?.fetchImpl,
      supabaseUrl: opts?.env?.NEXT_PUBLIC_SUPABASE_URL,
    });
    profileFacts = factsFromHotelProfile(profile) || profileFacts;
    if (profile) fromProfile = true;
  } else if (profile && profileFacts && !fromCache) {
    fromProfile = true;
  }

  const fresh = await loadItem(admin, itemId);
  if (!fresh) return result("introuvable");
  let details = { ...(fresh.details || {}) };
  const filled: string[] = [];
  let changed = false;
  const apply = (facts: HotelWebFacts | null, mode: { review?: boolean; remember?: boolean }) => {
    if (!facts) return;
    const merged = mergeHotelWebFacts(details, facts, {
      markReview: mode.review === true && profile?.status !== "verified",
      cacheKey: key,
      model: mode.remember ? model || PERPLEXITY_HOTEL_MODEL : undefined,
      remember: mode.remember === true,
    });
    details = merged.details;
    changed = changed || merged.changed;
    for (const label of merged.filled) if (!filled.includes(label)) filled.push(label);
  };
  apply(catalogue.hotel, {});
  apply(catalogue.contacts, {});
  apply(profileFacts, { review: profile?.status !== "verified", remember: Boolean(webFacts) && !fromCache });
  if (profile) {
    if (details.hotel_profile_key !== key || details.hotel_profile_status !== profile.status) {
      details.hotel_profile_key = key;
      details.hotel_profile_status = profile.status;
      changed = true;
    }
  }
  if (changed) await admin.from("crm_booking_items").update({ details }).eq("id", itemId);
  const fiche = profile ? publicHotelProfile(profile) : null;
  if (webError && !webFacts && !profileFacts) return result(webError, filled, { fiche });
  const usedProfileOnly = fromProfile && !webFacts;
  return result(filled.length ? "complete" : "deja_complet", filled, {
    cache: fromCache,
    depuis_fiche: usedProfileOnly,
    modele: model || (fromCache ? PERPLEXITY_HOTEL_MODEL : null),
    fiche,
  });
}

/** Recopie la fiche sur les champs vides. Ne lance pas de recherche et n’envoie rien. */
export async function fillCardFromProfile(
  admin: SupabaseClient,
  itemId: string,
  sourceKey?: string
): Promise<HotelWebRunResult> {
  const item = await loadItem(admin, itemId);
  if (!item) return result("introuvable");
  if (item.kind !== "hotel") return result("pas_hotel");
  const identity = hotelSearchIdentity(item);
  const key = sourceKey || identity.key;
  const parts = splitHotelKey(key);
  if (!parts) return result("ville_absente");
  const profile = await readHotelProfile(admin, parts.name_key, parts.city_key);
  const facts = factsFromHotelProfile(profile);
  if (!profile || !facts) return result("deja_complet", [], { message: "Pas de fiche pour cet hôtel." });
  const merged = mergeHotelWebFacts(item.details, facts, {
    markReview: profile.status !== "verified",
    cacheKey: key,
  });
  const details = merged.details;
  details.hotel_profile_key = key;
  details.hotel_profile_status = profile.status;
  const changed = merged.changed || item.details?.hotel_profile_status !== profile.status;
  if (changed) await admin.from("crm_booking_items").update({ details }).eq("id", itemId);
  return result(merged.filled.length ? "complete" : "deja_complet", merged.filled, {
    depuis_fiche: true,
    fiche: publicHotelProfile(profile),
  });
}

export type HotelBackfillCard = {
  id: string;
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

type BackfillGroup = {
  key: string;
  name: string;
  city: string;
  ids: string[];
  gaps: string[];
  nameKey: string;
  sites: Set<string>;
  addresses: Set<string>;
};

function hostOf(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const official = officialSiteHost(raw);
  if (official) return official;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function addressAnchor(value: unknown) {
  const folded = foldHotelLabel(typeof value === "string" ? value : "");
  return folded.length >= 8 ? folded : "";
}

function sharesAnchor(left: BackfillGroup, right: BackfillGroup) {
  if (!left.nameKey || left.nameKey !== right.nameKey) return false;
  for (const site of left.sites) if (site && right.sites.has(site)) return true;
  for (const address of left.addresses) if (address && right.addresses.has(address)) return true;
  return false;
}

function mergeBackfillGroups(groups: BackfillGroup[]) {
  const parent = groups.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (sharesAnchor(groups[i], groups[j])) parent[find(j)] = find(i);
    }
  }
  const merged = new Map<number, BackfillGroup>();
  for (let i = 0; i < groups.length; i++) {
    const root = find(i);
    const group = groups[i];
    const current = merged.get(root);
    if (!current) {
      merged.set(root, {
        ...group,
        ids: [...group.ids],
        gaps: [...group.gaps],
        sites: new Set(group.sites),
        addresses: new Set(group.addresses),
      });
      continue;
    }
    for (const id of group.ids) if (!current.ids.includes(id)) current.ids.push(id);
    for (const gap of group.gaps) if (!current.gaps.includes(gap)) current.gaps.push(gap);
    for (const site of group.sites) if (site) current.sites.add(site);
    for (const address of group.addresses) if (address) current.addresses.add(address);
  }
  return [...merged.values()].map(({ key, name, city, ids, gaps }) => ({ key, name, city, ids, gaps }));
}

/**
 * Cartes actives à rechercher : hors Little Emperors, hors ville ou pays seuls,
 * hors Airbnb et location de villa. Même hôtel, autre ville : une ligne si le site ou l’adresse est le même.
 */
export function planHotelBackfill(
  cards: HotelBackfillCard[],
  leRows: { hotel_name?: string | null; city?: string | null; country?: string | null }[]
) {
  const catalogue = leRows.map((row) => ({
    name: row.hotel_name,
    city: row.city,
    country: row.country,
  }));
  const groups: BackfillGroup[] = [];
  const byKey = new Map<string, BackfillGroup>();
  for (const card of cards) {
    if (card.lifecycle === "cancelled" || card.lifecycle === "superseded") continue;
    if (realLeHotelId(card.details)) continue;
    if (supplierIsPrivateRental(card.supplier)) continue;
    const identity = hotelSearchIdentity(card);
    if (!identity.key) continue;
    if (hotelNameIsOnlyPlace(identity.name, identity.city)) continue;
    const country = countryOf(card.details);
    if (pickCatalogueHotel(catalogue, identity.name, identity.city, { loose: true, country })) continue;
    const gaps = hotelWebGaps(card.details);
    const site = hostOf(card.details?.website);
    const address = addressAnchor(card.details?.address);
    const current = byKey.get(identity.key);
    if (!current) {
      const created: BackfillGroup = {
        key: identity.key,
        name: identity.name,
        city: identity.city,
        ids: [card.id],
        gaps,
        nameKey: hotelNameKey(identity.name),
        sites: new Set(site ? [site] : []),
        addresses: new Set(address ? [address] : []),
      };
      byKey.set(identity.key, created);
      groups.push(created);
      continue;
    }
    current.ids.push(card.id);
    for (const gap of gaps) if (!current.gaps.includes(gap)) current.gaps.push(gap);
    if (site) current.sites.add(site);
    if (address) current.addresses.add(address);
  }
  return mergeBackfillGroups(groups);
}

export async function lireFicheHotel(admin: SupabaseClient, input: Record<string, unknown>) {
  let name = typeof input.nom === "string" ? input.nom.trim() : "";
  let city = typeof input.ville === "string" ? input.ville.trim() : "";
  const carteId = typeof input.carte_id === "string" ? input.carte_id.trim() : "";
  if (carteId) {
    const item = await loadItem(admin, carteId);
    if (!item || item.kind !== "hotel") return { fiche: null, message: "Carte hôtel introuvable." };
    const identity = hotelSearchIdentity(item);
    name = name || identity.name;
    city = city || identity.city;
  }
  const parts = splitHotelKey(hotelCacheKey(name, city));
  if (!parts) return { fiche: null, message: "Nom et ville requis." };
  const profile = await readHotelProfile(admin, parts.name_key, parts.city_key);
  if (!profile) return { fiche: null, message: "Pas de fiche pour cet hôtel." };
  return {
    fiche: publicHotelProfile(profile),
    message:
      profile.status === "verified"
        ? "Fiche vérifiée."
        : "Fiche à vérifier. Aucun message n’est envoyé.",
  };
}

/** Passe la fiche en vérifiée. Ne change pas la visibilité de la carte et n’envoie rien. */
export async function validerFicheHotel(admin: SupabaseClient, itemId: string) {
  const item = await loadItem(admin, itemId);
  if (!item || item.kind !== "hotel") return { ok: false, message: "Carte hôtel introuvable." };
  const identity = hotelSearchIdentity(item);
  const parts = splitHotelKey(identity.key);
  if (!parts) return { ok: false, message: "Indiquez la ville de l’hôtel." };
  const profile = await readHotelProfile(admin, parts.name_key, parts.city_key);
  if (!profile) return { ok: false, message: "Pas de fiche à valider." };
  const next = verifyHotelProfile(profile);
  await saveHotelProfile(admin, next);
  const details: Record<string, unknown> = {
    ...(item.details || {}),
    hotel_profile_key: identity.key,
    hotel_profile_status: "verified",
  };
  if (details.review_reason === HOTEL_WEB_REVIEW_REASON) {
    delete details.needs_review;
    delete details.review_reason;
  }
  await admin.from("crm_booking_items").update({ details }).eq("id", itemId);
  return {
    ok: true,
    fiche: publicHotelProfile(next),
    message: "Fiche validée. Aucun message n’est envoyé. La visibilité de la carte ne change pas.",
  };
}

export async function enrichirHotelFromInput(
  admin: SupabaseClient,
  input: Record<string, unknown>,
  opts?: { env?: Record<string, string | undefined>; fetchImpl?: FetchLike }
) {
  const carteId = typeof input.carte_id === "string" ? input.carte_id.trim() : "";
  if (!carteId) return result("introuvable", [], { message: "Carte requise." });
  return runHotelEnrichment(admin, carteId, { force: true, env: opts?.env, fetchImpl: opts?.fetchImpl });
}
