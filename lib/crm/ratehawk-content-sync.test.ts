import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EtgCall } from "./ratehawk/client";
import type { RatehawkConfig } from "./ratehawk/config";
import { cursorFor, productionCountries, syncRatehawkContent, type ContentCursor } from "./ratehawk/content";
import { runRatehawkLookup, parseRatehawkLookup } from "./ratehawk/lookup";

const base = {
  baseUrl: "https://api.ratehawk.com",
  keyId: "key",
  apiKey: "secret",
  proxy: null,
  paymentType: "deposit",
  priceIncreasePercent: 10,
  marginPercent: 12,
  searchTimeoutSeconds: 30,
  prebookTimeoutMs: 60_000,
  bookingCutoffSeconds: 180,
  orderInfoDelaySeconds: 60,
  currency: "EUR",
  agencyEmail: "agence@travelba.fr",
  agencyPhone: "12345",
  webhookToken: "",
} as const;

const production = { ...base, environment: "production", language: "fr" } satisfies RatehawkConfig;
const sandbox = { ...base, environment: "sandbox", baseUrl: "https://api-sandbox.ratehawk.com", language: "en" } satisfies RatehawkConfig;

function call(data: unknown, httpStatus = 200): EtgCall {
  return { httpStatus, status: httpStatus === 200 ? "ok" : "error", error: httpStatus === 200 ? null : "unexpected_method", data, durationMs: 1 };
}

function fakeDb(initial: ContentCursor | null) {
  const state: { sync: Record<string, unknown> | null; hotels: Map<number, Record<string, unknown>>; regions: number } = {
    sync: initial ? { id: "content", cursor: initial } : null,
    hotels: new Map(),
    regions: 0,
  };
  const db = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: state.sync, error: null }) };
            },
          };
        },
        async upsert(rows: unknown) {
          const list = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
          if (table === "crm_ratehawk_sync") state.sync = { ...(state.sync || {}), ...list[0] };
          if (table === "crm_ratehawk_hotels") for (const row of list) state.hotels.set(Number(row.hid), row);
          if (table === "crm_ratehawk_regions") state.regions += list.length;
          return { error: null };
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, state };
}

const content = (hids: number[]) => call(hids.map((hid) => ({ hid, name: `Hôtel réel ${hid}`, address: "1 rue de Paris", region: { id: 2734, country_code: "FR" } })));

test("productionCountries met la France d’abord et garde les pays connus", () => {
  const ids = productionCountries({
    country: [
      { value: "107", desc: "Italy" },
      { value: "59", desc: "France" },
      { value: "1", desc: "Afghanistan" },
    ],
  });
  assert.deepEqual(ids, [59, 107]);
  assert.deepEqual(productionCountries(null), [59]);
});

test("un curseur du bac à sable ne sert pas en production", () => {
  assert.deepEqual(cursorFor({ countries: [59, 189, 201], country_index: 1 }, "production"), { environment: "production" });
  assert.equal(cursorFor({ countries: [59, 189, 201], country_index: 1 }, "sandbox").country_index, 1);
  assert.equal(cursorFor({ environment: "production", country_index: 2 }, "production").country_index, 2);
});

test("production : filter_values en GET, pays réels, reprise par offset, pas d’hôtel de test", async () => {
  const { db, state } = fakeDb({ countries: [59, 189, 201], country_index: 1, updated_since: "2026-11-26 03:10:26" });
  const france = Array.from({ length: 4_500 }, (_, i) => 4_500 - i);
  const gets: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const deps = {
    get: async (path: string) => {
      gets.push(path);
      return call({ country: [{ value: "59", desc: "France" }, { value: "107", desc: "Italy" }] });
    },
    post: async (path: string, body: unknown) => {
      const sent = body as Record<string, unknown>;
      if (path === "/api/content/v1/hotel_ids_by_filter/") {
        bodies.push(sent);
        return call({ hids: (sent.country as number[])[0] === 59 ? france : [9_000_001] });
      }
      if (path === "/api/content/v1/hotel_content_by_ids/") {
        assert.equal(sent.language, "fr");
        assert.ok((sent.hids as number[]).length <= 100);
        return content(sent.hids as number[]);
      }
      if (path === "/api/b2b/v3/hotel/region/dump/") return call({});
      throw new Error(path);
    },
    download: async () => {
      throw new Error("download");
    },
    now: () => 1_000,
  };
  const first = await syncRatehawkContent(db, production, deps);
  assert.equal(first.ok, true);
  assert.deepEqual(gets, ["/api/content/v1/filter_values"]);
  assert.equal(first.hotels, 3_000);
  assert.deepEqual(first.certification, []);
  assert.equal(bodies[0].preferable, true);
  assert.equal(bodies[0].updated_since, undefined);
  assert.ok(state.hotels.has(1) && state.hotels.has(3_000) && !state.hotels.has(3_001));
  assert.ok(!state.hotels.has(10004834) && !state.hotels.has(8819557));
  const cursor = state.sync?.cursor as ContentCursor;
  assert.equal(cursor.environment, "production");
  assert.deepEqual(cursor.countries, [59, 107]);
  assert.equal(cursor.country_index, 0);
  assert.equal(cursor.hid_offset, 3_000);

  const second = await syncRatehawkContent(db, production, deps);
  assert.equal(second.ok, true);
  assert.equal(gets.length, 1);
  // France finie, puis l’Italie, puis fin de cycle dans le même passage.
  assert.equal(state.hotels.size, 4_501);
  const wrapped = state.sync?.cursor as ContentCursor;
  assert.equal(wrapped.country_index, 0);
  assert.equal(wrapped.countries, undefined);
  assert.equal(wrapped.updated_since, "1970-01-01 00:00:01");

  bodies.length = 0;
  const third = await syncRatehawkContent(db, production, deps);
  assert.equal(third.ok, true);
  assert.equal(gets.length, 2);
  assert.equal(bodies[0].updated_since, "1970-01-01 00:00:01");
});

test("une erreur ETG garde l’avancée et renvoie ok false", async () => {
  const { db, state } = fakeDb({ environment: "production", countries: [59], country_index: 0, hid_offset: 0 });
  const result = await syncRatehawkContent(db, production, {
    get: async () => call({}),
    post: async (path) => (path === "/api/content/v1/hotel_ids_by_filter/" ? call(null, 429) : content([])),
    now: () => 1_000,
  });
  assert.equal(result.ok, false);
  assert.match(result.error || "", /hotel_ids_by_filter/);
  assert.equal((state.sync?.cursor as ContentCursor).hid_offset, 0);
});

test("bac à sable : pays 59, 189, 201, 40 hôtels, hôtels de certification", async () => {
  const { db, state } = fakeDb(null);
  let gets = 0;
  const result = await syncRatehawkContent(db, sandbox, {
    get: async () => {
      gets += 1;
      return call({});
    },
    post: async (path, body) => {
      const sent = body as Record<string, unknown>;
      if (path === "/api/content/v1/hotel_ids_by_filter/") {
        assert.equal(sent.preferable, undefined);
        return call({ hids: Array.from({ length: 100 }, (_, i) => i + 1) });
      }
      if (path === "/api/content/v1/hotel_content_by_ids/") return content(sent.hids as number[]);
      return call({});
    },
    now: () => 1_000,
  });
  assert.equal(result.ok, true);
  assert.equal(gets, 0);
  assert.ok(result.certification.length > 0);
  const cursor = state.sync?.cursor as ContentCursor;
  assert.deepEqual(cursor.countries, [59, 189, 201]);
  assert.ok(result.hotels <= 40 + result.certification.length);
});

test("la recherche du connecteur complète les hôtels affichés avant de les lire", async () => {
  const order: string[] = [];
  let filled: number[] = [];
  const today = new Date("2026-11-11T12:00:00Z");
  const query = parseRatehawkLookup({ region_id: 2734, arrivee: "2026-12-10", depart: "2026-12-11", recherche: [{ adultes: 2 }] }, today);
  const result = await runRatehawkLookup(query, {
    config: production,
    searchRegion: async () => ({
      call: call({}),
      hotels: Array.from({ length: 10 }, (_, i) => ({ hid: i + 1, name: "", address: null, star_rating: null, region_id: 2734, rates: [], images: [] })),
    }),
    fillStatic: async (hids) => {
      order.push("fill");
      filled = hids;
    },
    loadStatic: async () => {
      order.push("load");
      return [];
    },
  });
  assert.deepEqual(order, ["fill", "load"]);
  assert.deepEqual(filled, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.marge, 12);
});
