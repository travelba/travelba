import { promisify } from "node:util";
import zlib from "node:zlib";
import { CERTIFICATION_HOTELS, CERTIFICATION_REGION } from "./catalog";
import { requireConfig, type RatehawkConfig } from "./config";
import { etgDownload, etgPost } from "./client";
import { ratehawkDb } from "./store";
import type { SupabaseClient } from "@supabase/supabase-js";

const zstdDecompress = promisify(zlib.zstdDecompress);

const SANDBOX_COUNTRIES = [59, 189, 201];
const HOTELS_PER_RUN = 40;
const CONTENT_CHUNK = 10;
const REGIONS_PER_RUN = 2_000;

function localized(value: unknown, language: "en" | "fr") {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  const preferred = row[language] || row.fr || row.en;
  if (typeof preferred === "string" && preferred.trim()) return preferred;
  const first = Object.values(row).find((item) => typeof item === "string" && item.trim());
  return typeof first === "string" ? first : "";
}

export function hotelRecord(raw: Record<string, unknown>, language: "en" | "fr") {
  const hid = Number(raw.hid);
  if (!Number.isInteger(hid)) return null;
  const region = raw.region && typeof raw.region === "object" ? (raw.region as Record<string, unknown>) : null;
  const images = Array.isArray(raw.images) ? raw.images : [];
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
    room_groups: Array.isArray(raw.room_groups) ? raw.room_groups : [],
    raw,
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

function countryIds(data: unknown, environment: RatehawkConfig["environment"]) {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const list = Array.isArray(root.country) ? root.country : [];
  const ids = list
    .map((item) => (typeof item === "number" ? item : Number((item as { value?: unknown })?.value)))
    .filter((id) => Number.isInteger(id));
  if (environment === "sandbox") {
    const allowed = ids.filter((id) => SANDBOX_COUNTRIES.includes(id));
    return allowed.length ? allowed : SANDBOX_COUNTRIES;
  }
  return ids;
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

export async function decompressDump(bytes: Uint8Array) {
  return zstdDecompress(bytes);
}

export async function syncRatehawkContent(supabase = ratehawkDb(), config = requireConfig()) {
  await seedCertification(supabase);
  const report = { hotels: 0, regions: 0, certification: CERTIFICATION_HOTELS.map((hotel) => hotel.hid), error: null as string | null };
  try {
    const { data: state } = await supabase.from("crm_ratehawk_sync").select("cursor").eq("id", "content").maybeSingle();
    const cursor = (state?.cursor && typeof state.cursor === "object" ? state.cursor : {}) as {
      updated_since?: string | null;
      country_index?: number;
      countries?: number[];
      regions_done_at?: string | null;
    };

    for (let offset = 0; offset < CERTIFICATION_HOTELS.length; offset += CONTENT_CHUNK) {
      const hids = CERTIFICATION_HOTELS.slice(offset, offset + CONTENT_CHUNK).map((hotel) => hotel.hid);
      const call = await etgPost("/api/content/v1/hotel_content_by_ids/", { hids, language: config.language }, 60_000, null, config);
      const rows = hotelsOf(call.data).map((hotel) => hotelRecord(hotel as Record<string, unknown>, config.language)).filter((row): row is NonNullable<typeof row> => Boolean(row));
      report.hotels += await upsertContent(supabase, rows);
    }

    const filters = await etgPost("/api/content/v1/filter_values", {}, 60_000, null, config);
    const countries = cursor.countries?.length ? cursor.countries : countryIds(filters.data, config.environment);
    const index = cursor.country_index ?? 0;
    const country = countries[index];
    let nextCursor = { ...cursor, countries };
    if (country != null && report.hotels < HOTELS_PER_RUN) {
      const body: Record<string, unknown> = { country: [country] };
      if (cursor.updated_since) body.updated_since = cursor.updated_since;
      const ids = await etgPost("/api/content/v1/hotel_ids_by_filter/", body, 60_000, null, config);
      const hids = hidsOf(ids.data).slice(0, HOTELS_PER_RUN);
      for (let offset = 0; offset < hids.length; offset += CONTENT_CHUNK) {
        const slice = hids.slice(offset, offset + CONTENT_CHUNK);
        const call = await etgPost("/api/content/v1/hotel_content_by_ids/", { hids: slice, language: config.language }, 60_000, null, config);
        const rows = hotelsOf(call.data).map((hotel) => hotelRecord(hotel as Record<string, unknown>, config.language)).filter((row): row is NonNullable<typeof row> => Boolean(row));
        report.hotels += await upsertContent(supabase, rows);
      }
      const wrapped = index + 1 >= countries.length;
      nextCursor = {
        ...nextCursor,
        country_index: wrapped ? 0 : index + 1,
        updated_since: wrapped ? new Date().toISOString().slice(0, 19).replace("T", " ") : cursor.updated_since || null,
      };
    }

    const regionsFresh = cursor.regions_done_at && Date.now() - new Date(cursor.regions_done_at).getTime() < 20 * 60 * 60 * 1000;
    if (!regionsFresh) {
      const dump = await etgPost("/api/b2b/v3/hotel/region/dump/", { language: "en" }, 60_000, null, config);
      const url = dump.data && typeof dump.data === "object" ? (dump.data as { url?: string }).url : null;
      if (url) {
        const packed = await etgDownload(url, config);
        if (packed.length > 80_000_000) throw new Error("dump_too_large");
        const plain = await decompressDump(packed);
        const text = new TextDecoder().decode(plain);
        const rows = [];
        let truncated = false;
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          if (rows.length >= REGIONS_PER_RUN) {
            truncated = true;
            break;
          }
          try {
            const record = regionRecord(JSON.parse(line) as Record<string, unknown>);
            if (record) rows.push(record);
          } catch {
            continue;
          }
        }
        if (rows.length) {
          const { error } = await supabase.from("crm_ratehawk_regions").upsert(rows, { onConflict: "id" });
          if (error) throw new Error(error.message);
          report.regions = rows.length;
        }
        if (!truncated) nextCursor = { ...nextCursor, regions_done_at: new Date().toISOString() };
      }
    }

    await supabase.from("crm_ratehawk_sync").upsert({
      id: "content",
      cursor: nextCursor,
      last_ok_at: new Date().toISOString(),
      last_error: null,
      hotels_upserted: report.hotels,
      regions_upserted: report.regions,
    });
    return { ok: true as const, ...report };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "sync";
    await supabase.from("crm_ratehawk_sync").upsert({ id: "content", last_error: message });
    return { ok: false as const, ...report, error: message };
  }
}
