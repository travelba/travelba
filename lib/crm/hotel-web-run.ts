import "server-only";

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
  parseHotelWebPayload,
  PERPLEXITY_HOTEL_MODEL,
  pickCatalogueHotel,
  ratehawkRowAgrees,
  shouldAutoEnrichHotel,
  type CatalogueContactRow,
  type CatalogueHotelRow,
  type HotelWebFacts,
  type HotelWebItem,
} from "@/lib/crm/hotel-web";
import { createServiceClient } from "@/lib/supabase/admin";

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
  modele: string | null;
  message: string;
};

type ItemRow = HotelWebItem & {
  id: string;
  booking_id?: string;
  details: Record<string, unknown> | null;
};

function messageFor(statut: HotelWebStatus, filled: string[]) {
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
  if (filled.length) return `Champs complétés : ${filled.join(", ")}. À vérifier.`;
  return "Aucun champ vide n’a été trouvé.";
}

function result(statut: HotelWebStatus, filled: string[] = [], extra?: Partial<HotelWebRunResult>): HotelWebRunResult {
  return {
    ok: statut === "complete" || statut === "deja_complet" || statut === "ignore",
    statut,
    rempli: filled,
    cache: extra?.cache === true,
    modele: extra?.modele || null,
    message: extra?.message || messageFor(statut, filled),
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
      };
    }
  }
  return {
    hotel: factsFromCatalogueHotel(hotel),
    contacts: factsFromCatalogueContacts(contacts, name, city),
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

/**
 * Complète une carte hôtel. N’écrit que `details` : la visibilité reste celle de la carte.
 * Sans clé et sans cache, un avertissement, et la carte n’est pas modifiée par la recherche.
 */
export async function enrichHotelItem(
  itemId: string,
  opts?: { force?: boolean; admin?: SupabaseClient; env?: Record<string, string | undefined>; fetchImpl?: typeof fetch }
): Promise<HotelWebRunResult> {
  const admin = opts?.admin || createServiceClient();
  const item = await loadItem(admin, itemId);
  if (!item) return result("introuvable");
  if (item.kind !== "hotel") return result("pas_hotel");
  if (item.lifecycle === "cancelled" || item.lifecycle === "superseded") return result("ignore");
  if (!opts?.force && !shouldAutoEnrichHotel(item)) {
    if (isLittleEmperorsHotel(item)) return result("ignore");
    if (!hotelWebGaps(item.details).length) return result("deja_complet");
    return result("ville_absente");
  }
  const identity = hotelSearchIdentity(item);
  const name = identity.name;
  const city = await searchCity(admin, item, name, identity.city);
  const key = identity.key || hotelCacheKey(name, city);
  if (!name || !city || !key) return result("ville_absente");
  if (!hotelWebGaps(item.details).length) return result("deja_complet");

  const catalogue = await catalogueFacts(admin, item, name, city);
  const preview = [catalogue.hotel, catalogue.contacts].reduce<Record<string, unknown>>(
    (details, facts) => (facts ? mergeHotelWebFacts(details, facts, { markReview: false }).details : details),
    { ...(item.details || {}) }
  );
  let fromCache = false;
  let webFacts: HotelWebFacts | null = null;
  let model: string | null = null;
  let webError: "cle_absente" | "reponse_invalide" | null = null;
  if (hotelWebGaps(preview).length) {
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

  const fresh = await loadItem(admin, itemId);
  if (!fresh) return result("introuvable");
  let details = { ...(fresh.details || {}) };
  const filled: string[] = [];
  let changed = false;
  const apply = (facts: HotelWebFacts | null, web: boolean) => {
    if (!facts) return;
    const merged = mergeHotelWebFacts(details, facts, {
      markReview: web,
      cacheKey: key,
      model: model || PERPLEXITY_HOTEL_MODEL,
      remember: web && !fromCache,
    });
    details = merged.details;
    changed = changed || merged.changed;
    for (const label of merged.filled) if (!filled.includes(label)) filled.push(label);
  };
  apply(catalogue.hotel, false);
  apply(catalogue.contacts, false);
  apply(webFacts, true);
  if (changed) await admin.from("crm_booking_items").update({ details }).eq("id", itemId);
  if (webError && !webFacts) return result(webError, filled);
  return result(filled.length ? "complete" : "deja_complet", filled, {
    cache: fromCache,
    modele: model || (fromCache ? PERPLEXITY_HOTEL_MODEL : null),
  });
}

export async function enrichirHotel(input: Record<string, unknown>, admin?: SupabaseClient) {
  const carteId = typeof input.carte_id === "string" ? input.carte_id.trim() : "";
  if (!carteId) return result("introuvable", [], { message: "Carte requise." });
  return enrichHotelItem(carteId, { force: true, admin });
}
