import type { SupabaseClient } from "@supabase/supabase-js";
import {
  factsFromCatalogueContacts,
  factsFromCatalogueHotel,
  hotelCacheKey,
  hotelSearchIdentity,
  hotelWebGaps,
  isLittleEmperorsHotel,
  loadPerplexityHotel,
  mergeHotelWebFacts,
  HOTEL_WEB_REVIEW_REASON,
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

export async function littleEmperorsCatalogMatch(admin: SupabaseClient, name: string, city: string) {
  const token = likeToken(name);
  if (!token || !city) return false;
  const listed = await admin.from("crm_le_hotels").select("hotel_name, city").ilike("hotel_name", `%${token}%`).limit(15);
  if (listed.error || !listed.data) return false;
  const match = pickCatalogueHotel(
    (listed.data as { hotel_name?: string; city?: string }[]).map((row) => ({
      name: row.hotel_name,
      city: row.city,
    })),
    name,
    city
  );
  return Boolean(match);
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
  let contacts: CatalogueContactRow[] = [];
  if (token) {
    const hotels = await admin
      .from("crm_le_hotels")
      .select("le_hotel_id, hotel_name, city")
      .ilike("hotel_name", `%${token}%`)
      .limit(15);
    const match = pickCatalogueHotel(
      ((hotels.data || []) as { le_hotel_id?: number; hotel_name?: string; city?: string }[]).map((row) => ({
        ...row,
        name: row.hotel_name,
      })),
      name,
      city
    ) as { le_hotel_id?: number; hotel_name?: string; city?: string } | null;
    if (match?.le_hotel_id) {
      const people = await admin
        .from("crm_hotel_contacts")
        .select("contact_type, email, phone, hotel_name, city")
        .eq("le_hotel_id", match.le_hotel_id);
      contacts = (people.data || []) as CatalogueContactRow[];
      return {
        hotel: factsFromCatalogueHotel(hotel),
        contacts: factsFromCatalogueContacts(contacts, match.hotel_name || name, match.city || city),
        catalog: true,
      };
    }
  }
  return {
    hotel: factsFromCatalogueHotel(hotel),
    contacts: factsFromCatalogueContacts(contacts, name, city),
    catalog: false,
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

/**
 * Complète une carte hôtel. N’écrit que `details` : la visibilité reste celle de la carte.
 * La fiche est lue avant le cache et Perplexity. Aucun e-mail n’est envoyé.
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
  const catalogMatch = name && cityHint ? await littleEmperorsCatalogMatch(admin, name, cityHint) : false;
  if (isLittleEmperorsHotel(item, catalogMatch) || realLeHotelId(item.details)) {
    return result("ignore");
  }
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
  if (catalogue.catalog || isLittleEmperorsHotel(item, catalogue.catalog)) return result("ignore");

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
export async function fillCardFromProfile(admin: SupabaseClient, itemId: string): Promise<HotelWebRunResult> {
  const item = await loadItem(admin, itemId);
  if (!item) return result("introuvable");
  if (item.kind !== "hotel") return result("pas_hotel");
  const identity = hotelSearchIdentity(item);
  const parts = splitHotelKey(identity.key);
  if (!parts) return result("ville_absente");
  const profile = await readHotelProfile(admin, parts.name_key, parts.city_key);
  const facts = factsFromHotelProfile(profile);
  if (!profile || !facts) return result("deja_complet", [], { message: "Pas de fiche pour cet hôtel." });
  const merged = mergeHotelWebFacts(item.details, facts, {
    markReview: profile.status !== "verified",
    cacheKey: identity.key,
  });
  const details = merged.details;
  details.hotel_profile_key = identity.key;
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

/** Cartes actives hors Little Emperors, une ligne par hôtel et par ville. */
export function planHotelBackfill(
  cards: HotelBackfillCard[],
  leRows: { hotel_name?: string | null; city?: string | null }[]
) {
  const catalogue = leRows.map((row) => ({ name: row.hotel_name, city: row.city }));
  const groups = new Map<string, { key: string; name: string; city: string; ids: string[]; gaps: string[] }>();
  for (const card of cards) {
    if (card.lifecycle === "cancelled" || card.lifecycle === "superseded") continue;
    if (realLeHotelId(card.details)) continue;
    const identity = hotelSearchIdentity(card);
    if (!identity.key) continue;
    if (pickCatalogueHotel(catalogue, identity.name, identity.city)) continue;
    const gaps = hotelWebGaps(card.details);
    const current = groups.get(identity.key);
    if (!current) {
      groups.set(identity.key, { key: identity.key, name: identity.name, city: identity.city, ids: [card.id], gaps });
      continue;
    }
    current.ids.push(card.id);
    for (const gap of gaps) if (!current.gaps.includes(gap)) current.gaps.push(gap);
  }
  return [...groups.values()];
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
