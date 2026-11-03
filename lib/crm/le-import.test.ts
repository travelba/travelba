import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingExtract } from "./ingest-types";
import { importLittleEmperorsReservations, leImportBlocked } from "./le-import";
import { LittleEmperorsError } from "./little-emperors";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const DOSSIER = "33333333-3333-4333-8333-333333333333";
const LINKED = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

function memory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    const state = {
      op: "select" as "select" | "insert" | "update",
      payload: {} as Row,
      filters: [] as { kind: "eq" | "in"; col: string; val: unknown }[],
      range: null as [number, number] | null,
    };
    const api = {
      select() {
        return api;
      },
      insert(payload: Row) {
        state.op = "insert";
        state.payload = payload;
        return api;
      },
      update(payload: Row) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters.push({ kind: "eq", col, val });
        return api;
      },
      in(col: string, val: unknown) {
        state.filters.push({ kind: "in", col, val });
        return api;
      },
      range(start: number, end: number) {
        state.range = [start, end];
        return api;
      },
      maybeSingle() {
        return Promise.resolve(run(true));
      },
      single() {
        return Promise.resolve(run(true));
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(run(false)).then(resolve, reject);
      },
    };
    function matches(row: Row) {
      return state.filters.every((filter) => {
        if (filter.kind === "eq") return row[filter.col] === filter.val;
        return Array.isArray(filter.val) && filter.val.includes(row[filter.col]);
      });
    }
    function run(single: boolean) {
      const bucket = tables[table] || (tables[table] = []);
      if (state.op === "insert") {
        const row = { id: `comp-${bucket.length + 1}`, ...state.payload };
        bucket.push(row);
        return { data: single ? row : [row], error: null };
      }
      let hits = bucket.filter(matches);
      if (state.op === "update") {
        for (const row of hits) Object.assign(row, state.payload);
      }
      if (state.range) hits = hits.slice(state.range[0], state.range[1] + 1);
      if (single) return { data: hits[0] || null, error: null };
      return { data: hits, error: null };
    }
    return api;
  }
  return { admin: { from } as unknown as SupabaseClient, tables };
}

function stay(patch: Row = {}): Row {
  return {
    id: "le-1",
    le_booking_id: 11,
    confirmation_number: "LE100",
    state: "booked",
    crm_booking_id: null,
    hotel_id: 50,
    hotel_name: "La Mamounia",
    city: "Marrakech",
    address: "Avenue Bab Jdid",
    website: "https://mamounia.example",
    check_in: "2026-12-01",
    check_out: "2026-12-04",
    currency: "EUR",
    total_cost: "1200",
    is_cancellable: true,
    cancellation_deadline: "2026-11-20",
    guest_names: ["Benamara Yannick"],
    cancellation_policies: ["Annulation gratuite jusqu’au 20 novembre."],
    room_types: ["Suite"],
    raw: {
      id: 11,
      board: "Petit-déjeuner",
      hotel_confirmation: "H998877",
      benefits: ["Petit-déjeuner", "Late checkout"],
      rooms: [
        {
          guest_name: "Benamara Yannick",
          room_type: "Suite",
          board: "Petit-déjeuner",
          hotel_confirmation: "H998877",
          cancellation_policy: "Annulation gratuite jusqu’au 20 novembre.",
        },
      ],
    },
    ...patch,
  };
}

function customer() {
  return { id: CLIENT, first_name: "Yannick", last_name: "Benamara" };
}

function harness(rows: Row[], extra: Record<string, Row[]> = {}) {
  const db = memory({
    crm_le_bookings: rows,
    crm_customers: [customer()],
    crm_bookings: [],
    crm_travel_companions: [],
    ...extra,
  });
  const calls = {
    persist: [] as { status: string; visibleToClient: boolean; extract: BookingExtract }[],
    apply: [] as { bookingId: string; visibleToClient: boolean; keepSellingPrice: boolean; extract: BookingExtract }[],
    refresh: [] as string[],
    hotels: [] as number[],
  };
  const deps = {
    admin: db.admin,
    async persist(opts: { customerId: string; extract: BookingExtract; status: "draft" | "confirmed"; visibleToClient: boolean }) {
      calls.persist.push(opts);
      const row = {
        id: "dossier-nouveau",
        reference: "TB-2026-0099",
        customer_id: opts.customerId,
        status: opts.status,
        visible_to_client: opts.visibleToClient,
      };
      db.tables.crm_bookings.push(row);
      return { id: row.id, reference: row.reference };
    },
    async apply(opts: {
      bookingId: string;
      customerId: string;
      extract: BookingExtract;
      visibleToClient: boolean;
      keepSellingPrice: boolean;
    }) {
      calls.apply.push(opts);
      return { id: opts.bookingId };
    },
    async refresh(bookingId: string) {
      calls.refresh.push(bookingId);
    },
    async rememberHotel(hotelId: number) {
      calls.hotels.push(hotelId);
    },
  };
  return { db, calls, deps };
}

test("une réservation réservée ouvre un dossier confirmé et la carte hôtel", async () => {
  const { db, calls, deps } = harness([stay()]);
  const result = await importLittleEmperorsReservations(
    { ids: ["le-1"], customerId: CLIENT, voyageurs: ["Camille Martin"] },
    deps
  );
  assert.equal(result.cree, true);
  assert.equal(result.statut, "confirmed");
  assert.equal(result.visible_client, false);
  assert.equal(result.message, false);
  assert.equal(result.invite, false);
  assert.equal(result.dossier_id, "dossier-nouveau");
  assert.equal(calls.persist.length, 1);
  assert.equal(calls.apply.length, 0);
  assert.equal(calls.persist[0].status, "confirmed");
  assert.equal(calls.persist[0].visibleToClient, false);
  const card = calls.persist[0].extract.items[0];
  assert.equal(card?.kind, "hotel");
  assert.equal(card?.title, "La Mamounia");
  assert.equal(card?.details?.city, "Marrakech");
  assert.equal(card?.start_at, "2026-12-01");
  assert.equal(card?.end_at, "2026-12-04");
  assert.equal(card?.details?.board, "Petit-déjeuner");
  assert.equal(card?.details?.supplier_net, 1200);
  assert.equal(card?.details?.supplier_currency, "EUR");
  assert.equal(card?.amount, null);
  assert.equal(card?.include_in_ledger, false);
  assert.match(String(card?.confirmation_ref), /LE100/);
  assert.match(String(card?.confirmation_ref), /H998877/);
  assert.equal((card?.details?.conditions as string[])[0], "Annulation gratuite jusqu’au 20 novembre.");
  const rooms = card?.details?.rooms as { type?: string; confirmation_ref?: string }[];
  assert.equal(rooms[0]?.type, "Suite");
  assert.equal(rooms[0]?.confirmation_ref, "H998877");
  const names = calls.persist[0].extract.travelers.map((person) => `${person.first_name} ${person.last_name}`);
  assert.ok(names.some((name) => name === "Benamara Yannick"));
  assert.ok(names.some((name) => name === "Camille Martin"));
  assert.equal(db.tables.crm_le_bookings[0].crm_booking_id, "dossier-nouveau");
  assert.equal(db.tables.crm_le_bookings[0].status, "linked");
  assert.equal(db.tables.crm_bookings[0].status, "confirmed");
  assert.equal(db.tables.crm_bookings[0].visible_to_client, false);
  assert.deepEqual(calls.refresh, ["dossier-nouveau"]);
  assert.deepEqual(calls.hotels, [50]);
  assert.equal(db.tables.crm_travel_companions.length, 1);
  assert.equal(db.tables.crm_travel_companions[0].first_name, "Camille");
  assert.equal(db.tables.crm_travel_companions[0].last_name, "Martin");
});

test("la confirmation hôtel retrouve la réservation", async () => {
  const { calls, deps } = harness([stay()]);
  const result = await importLittleEmperorsReservations({ references: ["H998877"], customerId: CLIENT }, deps);
  assert.equal(result.cree, true);
  assert.equal(calls.persist.length, 1);
});

test("rattacher ajoute la carte au dossier déjà ouvert", async () => {
  const { db, calls, deps } = harness([stay()], {
    crm_bookings: [
      { id: DOSSIER, reference: "TB-2026-0004", customer_id: CLIENT, status: "draft", visible_to_client: false },
    ],
  });
  const result = await importLittleEmperorsReservations(
    { ids: ["le-1"], customerId: CLIENT, dossierId: DOSSIER },
    deps
  );
  assert.equal(result.cree, false);
  assert.equal(result.dossier_id, DOSSIER);
  assert.equal(result.statut, "confirmed");
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.apply.length, 1);
  assert.equal(calls.apply[0].bookingId, DOSSIER);
  assert.equal(calls.apply[0].keepSellingPrice, true);
  assert.equal(calls.apply[0].visibleToClient, false);
  assert.equal(calls.apply[0].extract.items[0]?.title, "La Mamounia");
  assert.equal(db.tables.crm_le_bookings[0].crm_booking_id, DOSSIER);
  assert.equal(db.tables.crm_bookings.find((row) => row.id === DOSSIER)?.status, "confirmed");
  assert.deepEqual(calls.refresh, [DOSSIER]);
});

test("trois références Little Emperors tiennent dans un seul dossier", async () => {
  const rows = ["Marrakech", "Paris", "Rome"].map((city, index) =>
    stay({
      id: `le-${index + 1}`,
      le_booking_id: 20 + index,
      confirmation_number: `LE20${index}`,
      hotel_name: `Hôtel ${city}`,
      city,
      hotel_id: 60 + index,
      raw: { id: 20 + index, board: "Demi-pension" },
    })
  );
  const { db, calls, deps } = harness(rows);
  const result = await importLittleEmperorsReservations(
    { references: ["LE200", "LE201", "LE202"], customerId: CLIENT },
    deps
  );
  assert.equal(result.cree, true);
  assert.equal(calls.persist.length, 1);
  assert.equal(calls.apply.length, 0);
  assert.equal(calls.persist[0].extract.items.length, 3);
  assert.deepEqual(
    db.tables.crm_le_bookings.map((row) => row.crm_booking_id),
    ["dossier-nouveau", "dossier-nouveau", "dossier-nouveau"]
  );
  assert.equal(result.cartes.length, 3);
  assert.deepEqual(calls.refresh, ["dossier-nouveau"]);
});

test("une réservation annulée ou en échec, ou déjà liée, est refusée", async () => {
  const cancelled = harness([stay({ state: "cancelled" })]);
  await assert.rejects(
    () => importLittleEmperorsReservations({ ids: ["le-1"], customerId: CLIENT }, cancelled.deps),
    (err: unknown) => err instanceof LittleEmperorsError && /annulée/.test(err.message)
  );
  assert.equal(cancelled.calls.persist.length, 0);

  const failed = harness([stay({ state: "failed" })]);
  await assert.rejects(
    () => importLittleEmperorsReservations({ ids: ["le-1"], customerId: CLIENT }, failed.deps),
    (err: unknown) => err instanceof LittleEmperorsError && /échec/.test(err.message)
  );
  assert.equal(failed.calls.persist.length, 0);

  const linked = harness([stay({ crm_booking_id: LINKED })], {
    crm_bookings: [{ id: LINKED, reference: "TB-2026-0100", customer_id: CLIENT, status: "confirmed", visible_to_client: false }],
  });
  await assert.rejects(
    () => importLittleEmperorsReservations({ ids: ["le-1"], customerId: CLIENT }, linked.deps),
    (err: unknown) => err instanceof LittleEmperorsError && err.message.includes("TB-2026-0100")
  );
  assert.equal(linked.calls.persist.length, 0);
  assert.equal(leImportBlocked("failed"), "echec");
  assert.equal(leImportBlocked("booked"), null);
});

test("forcer importe une annulation, et le même dossier ne recrée pas la carte", async () => {
  const forced = harness([stay({ state: "cancelled" })]);
  const created = await importLittleEmperorsReservations(
    { ids: ["le-1"], customerId: CLIENT, force: true },
    forced.deps
  );
  assert.equal(created.cree, true);
  assert.equal(forced.calls.persist.length, 1);
  assert.equal(forced.calls.persist[0].extract.document_status, null);

  const same = harness([stay({ crm_booking_id: DOSSIER })], {
    crm_bookings: [{ id: DOSSIER, reference: "TB-2026-0004", customer_id: CLIENT, status: "confirmed", visible_to_client: true }],
  });
  const again = await importLittleEmperorsReservations(
    { ids: ["le-1"], customerId: CLIENT, dossierId: DOSSIER },
    same.deps
  );
  assert.equal(again.deja, true);
  assert.equal(again.dossier_id, DOSSIER);
  assert.equal(same.calls.persist.length, 0);
  assert.equal(same.calls.apply.length, 0);
  assert.equal(again.message, false);
});
