import { promisify } from "node:util";
import zlib from "node:zlib";
import { CERTIFICATION_HOTELS, CERTIFICATION_REGION } from "./catalog";
import { requireConfig, type RatehawkConfig } from "./config";
import { etgDownload, etgGet, etgPost, type EtgCall } from "./client";
import { collectImageUrls, publicHotelName } from "./display";
import { ratehawkDb } from "./store";
import type { SupabaseClient } from "@supabase/supabase-js";

const zstdDecompress = promisify(zlib.zstdDecompress);

const SANDBOX_COUNTRIES = [59, 189, 201];
const FRANCE = 59;
/**
 * Marque le curseur hôtel. Un curseur sans cette marque reprend les régions
 * et recommence la liste d’hôtels : l’ancien offset visait une autre sélection.
 */
export const CONTENT_SELECTION = "stars-4-5-ski3";
/** L’écran montre au plus 12 photos. Les groupes de chambres en montrent 4. */
const STORED_IMAGES = 12;
const STORED_ROOM_IMAGES = 4;
/** ETG : « Ski slope nearby ». hotel_ids_by_filter n’a pas de filtre par région. */
export const SKI_SLOPE_FILTER = "has_ski";
const SANDBOX_HOTELS_PER_RUN = 40;
/** Production : jusqu’à 3 000 fiches par passage, en lots de 100 (maximum ETG). */
const PRODUCTION_HOTELS_PER_RUN = 3_000;
const CONTENT_CHUNK = 10;
const SYNC_CHUNK = 100;
/** hotel_ids_by_filter est limité à 60 par minute. */
const ID_CALLS_PER_RUN = 10;
/** maxDuration de la route : 300 s. Les fiches s’arrêtent à 200 s, les régions ne démarrent plus après 230 s. */
const HOTEL_BUDGET_MS = 200_000;
const REGIONS_START_BEFORE_MS = 230_000;
const REGIONS_PER_RUN = 20_000;
const REGION_BATCH = 1_000;

function localized(value: unknown, language: "en" | "fr") {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  const preferred = row[language] || row.fr || row.en;
  if (typeof preferred === "string" && preferred.trim()) return preferred;
  const first = Object.values(row).find((item) => typeof item === "string" && item.trim());
  return typeof first === "string" ? first : "";
}

function capArray(value: unknown, limit: number) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

/** Photos, textes et politiques lus par l’écran. Le reste du JSON ETG n’est pas stocké. */
function storedRaw(raw: Record<string, unknown>) {
  return {
    images_ext: capArray(raw.images_ext, STORED_IMAGES),
    description_struct: raw.description_struct ?? null,
    amenity_groups: raw.amenity_groups ?? null,
    policy_struct: raw.policy_struct ?? null,
  };
}

function storedRoomGroups(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((group) => {
    if (!group || typeof group !== "object") return group;
    const row = group as Record<string, unknown>;
    return {
      name: row.name ?? null,
      rg_ext: row.rg_ext ?? null,
      room_amenities: row.room_amenities ?? [],
      images: capArray(row.images, STORED_ROOM_IMAGES),
      images_ext: capArray(row.images_ext, STORED_ROOM_IMAGES),
    };
  });
}

export function hotelRecord(raw: Record<string, unknown>, language: "en" | "fr") {
  const hid = Number(raw.hid);
  if (!Number.isInteger(hid)) return null;
  const region = raw.region && typeof raw.region === "object" ? (raw.region as Record<string, unknown>) : null;
  const images = collectImageUrls(Array.isArray(raw.images) && raw.images.length ? raw.images : raw.images_ext, STORED_IMAGES);
  return {
    hid,
    slug: typeof raw.id === "string" ? raw.id : null,
    name: localized(raw.name, language) || `Hôtel ${hid}`,
    address: typeof raw.address === "string" ? raw.address : null,
    region_id: region ? Number(region.id) || null : raw.region_id == null ? null : Number(raw.region_id) || null,
    region_name: region ? localized(region.name, language) : null,
    country_code: typeof raw.country_code === "string" ? raw.country_code : region && typeof region.country_code === "string" ? region.country_code : null,
    star_rating: raw.star_rating == null ? null : Number(raw.star_rating) || null,
    kind: typeof raw.kind === "string" ? raw.kind : null,
    check_in_time: typeof raw.check_in_time === "string" ? raw.check_in_time : null,
    check_out_time: typeof raw.check_out_time === "string" ? raw.check_out_time : null,
    images,
    metapolicy_struct: raw.metapolicy_struct ?? null,
    metapolicy_extra_info: typeof raw.metapolicy_extra_info === "string" ? raw.metapolicy_extra_info : null,
    room_groups: storedRoomGroups(raw.room_groups),
    raw: storedRaw(raw),
    source: "content",
    updated_at: new Date().toISOString(),
  };
}

export function regionRecord(raw: Record<string, unknown>) {
  const id = Number(raw.id);
  if (!Number.isInteger(id)) return null;
  const center = raw.center && typeof raw.center === "object" ? (raw.center as Record<string, unknown>) : null;
  return {
    id,
    name: localized(raw.name, "en") || localized(raw.name, "fr") || `Région ${id}`,
    name_fr: localized(raw.name, "fr") || null,
    country_code: typeof raw.country_code === "string" ? raw.country_code : null,
    country_name: localized(raw.country_name, "fr") || localized(raw.country_name, "en") || null,
    type: typeof raw.type === "string" ? raw.type : null,
    latitude: center ? Number(center.latitude) || null : null,
    longitude: center ? Number(center.longitude) || null : null,
    iata: typeof raw.iata === "string" ? raw.iata : null,
    updated_at: new Date().toISOString(),
  };
}

async function seedCertification(supabase: SupabaseClient) {
  await supabase.from("crm_ratehawk_regions").upsert(
    { ...CERTIFICATION_REGION, updated_at: new Date().toISOString() },
    { onConflict: "id", ignoreDuplicates: true }
  );
  await supabase.from("crm_ratehawk_hotels").upsert(
    CERTIFICATION_HOTELS.map((hotel) => ({
      hid: hotel.hid,
      name: hotel.name,
      region_id: hotel.region_id,
      region_name: hotel.region_name,
      country_code: hotel.country_code,
      source: "seed",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "hid", ignoreDuplicates: true }
  );
}

function callFailedOf(call: EtgCall) {
  return call.httpStatus !== 200 || (call.status != null && call.status !== "ok");
}

/** Tous les pays ETG. La France d’abord, puis les autres identifiants dans l’ordre croissant. */
export function productionCountries(data: unknown) {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const list = Array.isArray(root.country) ? root.country : [];
  const ids = new Set<number>();
  for (const item of list) {
    const id = typeof item === "number" ? item : Number((item as { value?: unknown })?.value);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  const rest = [...ids].filter((id) => id !== FRANCE).sort((a, b) => a - b);
  return [FRANCE, ...rest];
}

export type CatalogLane = "stars" | "ski";

/** Filtre ETG appliqué avant tout téléchargement de fiche. */
export function hotelIdFilter(lane: CatalogLane): Record<string, unknown> {
  if (lane === "ski") return { star_rating: [3], serp_filter: [SKI_SLOPE_FILTER] };
  return { star_rating: [4, 5] };
}

function keptStar(star: unknown, lane: CatalogLane) {
  const value = Number(star);
  if (!Number.isInteger(value)) return false;
  if (value === 4 || value === 5) return true;
  return lane === "ski" && value === 3;
}

function hidsOf(data: unknown) {
  const root = data && typeof data === "object" ? (data as { hids?: unknown }) : {};
  return Array.isArray(root.hids) ? root.hids.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
}

function hotelsOf(data: unknown) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const root = data as { hotels?: unknown };
  return Array.isArray(root.hotels) ? root.hotels : [];
}

async function upsertContent(supabase: SupabaseClient, rows: Record<string, unknown>[]) {
  if (!rows.length) return 0;
  const { error } = await supabase.from("crm_ratehawk_hotels").upsert(rows, { onConflict: "hid" });
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Complète les hôtels sans nom public ou sans adresse, avant de les montrer. Vingt au plus. */
export async function fillThinHotelFacts(hids: number[], config = requireConfig(), supabase = ratehawkDb()) {
  const unique = [...new Set(hids.filter((hid) => Number.isInteger(hid) && hid > 0))].slice(0, 20);
  if (!unique.length) return;
  try {
    const { data } = await supabase.from("crm_ratehawk_hotels").select("hid, name, address").in("hid", unique);
    const byHid = new Map((data || []).map((row) => [Number(row.hid), row]));
    const missing = unique.filter((hid) => {
      const row = byHid.get(hid);
      if (!row) return true;
      if (publicHotelName(typeof row.name === "string" ? row.name : null, null, hid) === "Hôtel") return true;
      return !(typeof row.address === "string" && row.address.trim());
    });
    for (let offset = 0; offset < missing.length; offset += CONTENT_CHUNK) {
      const slice = missing.slice(offset, offset + CONTENT_CHUNK);
      const call = await etgPost("/api/content/v1/hotel_content_by_ids/", { hids: slice, language: config.language }, 60_000, null, config);
      const rows = hotelsOf(call.data)
        .map((hotel) => hotelRecord(hotel as Record<string, unknown>, config.language))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      await upsertContent(supabase, rows);
    }
  } catch {
    // La recherche garde le contenu déjà en base.
  }
}

export async function decompressDump(bytes: Uint8Array) {
  return zstdDecompress(bytes);
}

export type ContentCursor = {
  /** Environnement qui a écrit le curseur. Un autre environnement repart de zéro. */
  environment?: RatehawkConfig["environment"];
  /** Sélection d’hôtels. Une autre marque recommence la liste, sans toucher aux régions. */
  selection?: string;
  countries?: number[];
  country_index?: number;
  /** `stars` : 4 et 5 étoiles. `ski` : 3 étoiles avec une piste à proximité, même pays. */
  lane?: CatalogLane;
  /** Position dans la liste triée des hid du pays et de la voie courants. */
  hid_offset?: number;
  /** Format ETG `YYYY-MM-DD HH:MM:SS`, posé à la fin d’un cycle complet. */
  updated_since?: string | null;
  cycle_started_at?: string | null;
  regions_done_at?: string | null;
  regions_offset?: number;
};

type SyncDeps = {
  post?: typeof etgPost;
  get?: typeof etgGet;
  download?: typeof etgDownload;
  now?: () => number;
};

function etgTime(ms: number) {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

/** Curseur lisible pour cet environnement. Le curseur du bac à sable ne sert jamais en production. */
export function cursorFor(raw: unknown, environment: RatehawkConfig["environment"]): ContentCursor {
  const cursor = (raw && typeof raw === "object" ? raw : {}) as ContentCursor;
  const sameEnv = cursor.environment ? cursor.environment === environment : environment === "sandbox";
  if (!sameEnv) return { environment };
  if (environment === "production" && cursor.selection !== CONTENT_SELECTION) {
    return {
      environment,
      selection: CONTENT_SELECTION,
      lane: "stars",
      country_index: 0,
      hid_offset: 0,
      regions_done_at: cursor.regions_done_at ?? null,
      regions_offset: cursor.regions_offset ?? 0,
    };
  }
  return { ...cursor, environment };
}

async function loadCountries(get: typeof etgGet, config: RatehawkConfig) {
  if (config.environment === "sandbox") return SANDBOX_COUNTRIES;
  const filters = await get("/api/content/v1/filter_values", 60_000, config);
  return productionCountries(filters.data);
}

export async function syncRatehawkContent(supabase = ratehawkDb(), config = requireConfig(), deps: SyncDeps = {}) {
  const post = deps.post ?? etgPost;
  const get = deps.get ?? etgGet;
  const download = deps.download ?? etgDownload;
  const now = deps.now ?? Date.now;
  const started = now();
  const sandbox = config.environment === "sandbox";
  const perRun = sandbox ? SANDBOX_HOTELS_PER_RUN : PRODUCTION_HOTELS_PER_RUN;
  const batch = sandbox ? CONTENT_CHUNK : SYNC_CHUNK;
  const report = {
    hotels: 0,
    regions: 0,
    certification: sandbox ? CERTIFICATION_HOTELS.map((hotel) => hotel.hid) : ([] as number[]),
    country: null as number | null,
    error: null as string | null,
  };
  let cursor: ContentCursor = { environment: config.environment };
  const save = async (extra: Record<string, unknown> = {}) => {
    await supabase.from("crm_ratehawk_sync").upsert({
      id: "content",
      cursor,
      hotels_upserted: report.hotels,
      regions_upserted: report.regions,
      ...extra,
    });
  };
  try {
    const { data: state } = await supabase.from("crm_ratehawk_sync").select("cursor").eq("id", "content").maybeSingle();
    cursor = cursorFor(state?.cursor, config.environment);
    if (!sandbox) cursor.selection = CONTENT_SELECTION;

    // Hôtels de test ETG : bac à sable seulement, jamais mêlés au contenu de production.
    if (sandbox) {
      await seedCertification(supabase);
      for (let offset = 0; offset < CERTIFICATION_HOTELS.length; offset += CONTENT_CHUNK) {
        const hids = CERTIFICATION_HOTELS.slice(offset, offset + CONTENT_CHUNK).map((hotel) => hotel.hid);
        const call = await post("/api/content/v1/hotel_content_by_ids/", { hids, language: config.language }, 60_000, null, config);
        const rows = hotelsOf(call.data).map((hotel) => hotelRecord(hotel as Record<string, unknown>, config.language)).filter((row): row is NonNullable<typeof row> => Boolean(row));
        report.hotels += await upsertContent(supabase, rows);
      }
    }

    if (!cursor.countries?.length) {
      cursor.countries = await loadCountries(get, config);
      cursor.country_index = 0;
      cursor.hid_offset = 0;
    }
    if (!cursor.cycle_started_at) cursor.cycle_started_at = etgTime(started);

    let idCalls = 0;
    while (report.hotels < perRun && idCalls < ID_CALLS_PER_RUN && now() - started < HOTEL_BUDGET_MS) {
      const countries: number[] = cursor.countries ?? [];
      const index = cursor.country_index ?? 0;
      const country = countries[index];
      if (country == null) {
        // Cycle complet : la suite ne lit que les hôtels modifiés depuis le début de ce cycle.
        cursor = {
          ...cursor,
          countries: undefined,
          country_index: 0,
          hid_offset: 0,
          lane: "stars",
          updated_since: cursor.cycle_started_at || etgTime(started),
          cycle_started_at: null,
        };
        break;
      }
      report.country = country;
      const lane: CatalogLane = !sandbox && cursor.lane === "ski" ? "ski" : "stars";
      const body: Record<string, unknown> = { country: [country] };
      if (!sandbox) Object.assign(body, hotelIdFilter(lane));
      if (cursor.updated_since) body.updated_since = cursor.updated_since;
      const ids = await post("/api/content/v1/hotel_ids_by_filter/", body, 60_000, null, config);
      idCalls += 1;
      if (callFailedOf(ids)) throw new Error(`hotel_ids_by_filter: ${ids.error || ids.httpStatus}`);
      const hids = [...new Set(hidsOf(ids.data))].sort((a, b) => a - b);
      let offset = Math.min(cursor.hid_offset ?? 0, hids.length);
      while (offset < hids.length && report.hotels < perRun && now() - started < HOTEL_BUDGET_MS) {
        const slice = hids.slice(offset, offset + Math.min(batch, perRun - report.hotels));
        const call = await post("/api/content/v1/hotel_content_by_ids/", { hids: slice, language: config.language }, 60_000, null, config);
        if (callFailedOf(call)) throw new Error(`hotel_content_by_ids: ${call.error || call.httpStatus}`);
        const rows = hotelsOf(call.data)
          .map((hotel) => hotelRecord(hotel as Record<string, unknown>, config.language))
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .filter((row) => sandbox || keptStar(row.star_rating, lane));
        report.hotels += await upsertContent(supabase, rows);
        offset += slice.length;
        cursor.hid_offset = offset;
        cursor.lane = lane;
      }
      if (offset >= hids.length) {
        if (!sandbox && lane === "stars") {
          cursor.lane = "ski";
          cursor.hid_offset = 0;
        } else {
          cursor.country_index = index + 1;
          cursor.lane = "stars";
          cursor.hid_offset = 0;
        }
      }
      await save();
    }
    await save({ last_ok_at: new Date(now()).toISOString(), last_error: null });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "sync";
    // Le curseur garde l’avancée déjà faite.
    await save({ last_error: message }).catch(() => undefined);
    return { ok: false as const, ...report, error: message };
  }

  try {
    const regionsFresh = cursor.regions_done_at && now() - new Date(cursor.regions_done_at).getTime() < 20 * 60 * 60 * 1000;
    if (!regionsFresh && now() - started < REGIONS_START_BEFORE_MS) {
      const dump = await post("/api/b2b/v3/hotel/region/dump/", { language: "en" }, 60_000, null, config);
      const url = dump.data && typeof dump.data === "object" ? (dump.data as { url?: string }).url : null;
      if (url) {
        const packed = await download(url, config);
        if (packed.length > 80_000_000) throw new Error("dump_too_large");
        const plain = await decompressDump(packed);
        const text = new TextDecoder().decode(plain);
        const skip = cursor.regions_offset ?? 0;
        let line = 0;
        let read = 0;
        let rows: ReturnType<typeof regionRecord>[] = [];
        let truncated = false;
        const flush = async () => {
          const valid = rows.filter((row): row is NonNullable<typeof row> => Boolean(row));
          rows = [];
          if (!valid.length) return;
          const { error } = await supabase.from("crm_ratehawk_regions").upsert(valid, { onConflict: "id" });
          if (error) throw new Error(error.message);
          report.regions += valid.length;
        };
        for (const raw of text.split("\n")) {
          if (!raw.trim()) continue;
          line += 1;
          if (line <= skip) continue;
          if (read >= REGIONS_PER_RUN) {
            truncated = true;
            break;
          }
          read += 1;
          try {
            rows.push(regionRecord(JSON.parse(raw) as Record<string, unknown>));
          } catch {
            continue;
          }
          if (rows.length >= REGION_BATCH) await flush();
        }
        await flush();
        cursor = truncated
          ? { ...cursor, regions_offset: skip + read }
          : { ...cursor, regions_offset: 0, regions_done_at: new Date(now()).toISOString() };
        await save({ last_ok_at: new Date(now()).toISOString(), last_error: null });
      }
    }
    return { ok: true as const, ...report };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "regions";
    await save({ last_error: `regions: ${message}` }).catch(() => undefined);
    return { ok: false as const, ...report, error: `regions: ${message}` };
  }
}
