import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
const load = Module._load;
Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
  if (request === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
  return load.call(this, request, parent, isMain);
};
import { LittleEmperorsError } from "./little-emperors";
import { leConfirmationMatches, leStayMatchesClient, reattachLittleEmperorsReservation } from "./le-reattach";

const SOURCE = "33333333-3333-4333-8333-333333333333";
const TARGET = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const CARD = "66666666-6666-4666-8666-666666666666";
const OTHER_CARD = "77777777-7777-4777-8777-777777777777";
const STAFF = "88888888-8888-4888-8888-888888888888";

type Row = Record<string, unknown>;

function memory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  const seen: string[] = [];
  const writes: { table: string; op: "update" | "insert"; payload: Row }[] = [];
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    seen.push(table);
    const state = {
      op: "select" as "select" | "insert" | "update",
      payload: {} as Row,
      filters: [] as { kind: "eq" | "in" | "ilike"; col: string; val: unknown }[],
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
      ilike(col: string, val: unknown) {
        state.filters.push({ kind: "ilike", col, val });
        return api;
      },
      maybeSingle() {
        return Promise.resolve(run(true));
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(run(false)).then(resolve, reject);
      },
    };
    function matches(row: Row) {
      return state.filters.every((filter) => {
        if (filter.kind === "eq") return row[filter.col] === filter.val;
        if (filter.kind === "in") return Array.isArray(filter.val) && filter.val.includes(row[filter.col]);
        const needle = String(filter.val).replace(/^%/, "").replace(/%$/, "").toLowerCase();
        return String(row[filter.col] ?? "").toLowerCase().includes(needle);
      });
    }
    function run(single: boolean) {
      const bucket = tables[table] || (tables[table] = []);
      if (state.op === "insert") {
        writes.push({ table, op: "insert", payload: { ...state.payload } });
        const row = { id: `row-${bucket.length + 1}`, ...state.payload };
        bucket.push(row);
        return { data: single ? row : [row], error: null };
      }
      const hits = bucket.filter(matches);
      if (state.op === "update") {
        writes.push({ table, op: "update", payload: { ...state.payload } });
        for (const row of hits) Object.assign(row, state.payload);
      }
      if (single) return { data: hits[0] || null, error: null };
      return { data: hits, error: null };
    }
    return api;
  }
  return { from, tables, seen, writes, client: { from } as unknown as SupabaseClient };
}

function seed(patch: { guests?: string[]; traveler?: Row | null; targetStatus?: string; archived?: string | null } = {}) {
  return memory({
    crm_le_bookings: [
      {
        id: "le-1",
        confirmation_number: "64570SH046735",
        guest_names: patch.guests ?? ["Jean Morel"],
        hotel_name: "Four Seasons Milano",
        crm_booking_id: SOURCE,
        status: "linked",
      },
    ],
    crm_bookings: [
      {
        id: SOURCE,
        reference: "TB-2026-0124",
        customer_id: CLIENT_A,
        status: "confirmed",
        archived_at: null,
        visible_to_client: true,
      },
      {
        id: TARGET,
        reference: "TB-2026-0049",
        customer_id: CLIENT_B,
        status: patch.targetStatus ?? "confirmed",
        archived_at: patch.archived ?? null,
        visible_to_client: true,
      },
    ],
    crm_customers: [
      { id: CLIENT_A, first_name: "Nina", last_name: "Bernard" },
      { id: CLIENT_B, first_name: "Hugo", last_name: "Martin" },
    ],
    crm_booking_travelers: patch.traveler ? [patch.traveler] : [],
    crm_booking_items: [
      {
        id: CARD,
        booking_id: SOURCE,
        kind: "hotel",
        title: "Four Seasons Milano",
        confirmation_ref: "64570SH046735",
        sort_order: 2,
        amount: "1480.00",
        visible_to_client: true,
      },
      {
        id: OTHER_CARD,
        booking_id: SOURCE,
        kind: "hotel",
        title: "Autre hôtel",
        confirmation_ref: "99999SH000001",
        sort_order: 3,
        amount: "10.00",
        visible_to_client: false,
      },
    ],
    crm_booking_documents: [{ id: "doc-1", booking_id: SOURCE, booking_item_id: CARD }],
    crm_hotel_requests: [{ id: "req-1", booking_id: SOURCE, booking_item_id: CARD }],
    crm_trip_costs: [{ id: "cost-1", booking_id: SOURCE, booking_item_id: CARD, amount_eur: "900.00", source: "pliant" }],
    crm_booking_cards: [{ id: "pliant-1", booking_id: SOURCE, pliant_card_id: "card-keep" }],
    crm_transactions: [{ id: "tx-1", booking_id: SOURCE, direction: "debit", amount: "1480.00" }],
    crm_audit_events: [],
  });
}

const move = {
  reference: "64570SH046735",
  dossierReference: "TB-2026-0049",
  staffId: STAFF,
};

test("le numéro court et la chambre sont la même réservation", () => {
  assert.equal(leConfirmationMatches("64570", "64570SH046735"), true);
  assert.equal(leConfirmationMatches("99999SH000001", "64570SH046735"), false);
  assert.equal(
    leStayMatchesClient(["Jean Morel"], [{ first_name: "Hugo", last_name: "Martin" }]),
    false
  );
  assert.equal(
    leStayMatchesClient(["Jean Morel"], [{ first_name: "Jean", last_name: "Martin", usage_name: "Morel" }]),
    true
  );
});

test("l’aperçu ne déplace rien", async () => {
  const db = seed();
  const result = await reattachLittleEmperorsReservation(move, { admin: db.client, journal: async () => {} });
  assert.equal(result.apercu, true);
  assert.equal(result.ecrit, false);
  assert.equal(result.debit_cree, false);
  assert.equal(result.cartes_pliant, "inchangees");
  assert.equal(result.message, false);
  assert.equal(result.client_coherent, false);
  assert.equal(result.accepter_client_requis, true);
  assert.equal(result.cartes[0]?.id, CARD);
  assert.equal(db.tables.crm_le_bookings[0].crm_booking_id, SOURCE);
  assert.equal(db.writes.length, 0);
});

test("un client différent est refusé sans accepter_client, même avec confirmer", async () => {
  const db = seed();
  await assert.rejects(
    () => reattachLittleEmperorsReservation({ ...move, confirmer: true }, { admin: db.client, journal: async () => {} }),
    (err: unknown) => err instanceof LittleEmperorsError && err.status === 409 && /accepter_client/.test(err.message)
  );
  assert.equal(db.tables.crm_le_bookings[0].crm_booking_id, SOURCE);
  assert.equal(db.tables.crm_booking_items[0].booking_id, SOURCE);
  assert.equal(db.writes.length, 0);
});

test("confirmer avec accepter_client déplace le lien et la carte, sans débit ni carte Pliant", async () => {
  const db = seed();
  const journal: { entityId: string; summary: string }[] = [];
  const result = await reattachLittleEmperorsReservation(
    { ...move, confirmer: true, accepterClient: true },
    {
      admin: db.client,
      journal: async (entry) => {
        journal.push({ entityId: entry.entityId, summary: entry.summary });
      },
    }
  );
  assert.equal(result.ecrit, true);
  assert.equal(result.message, false);
  assert.equal(result.debit_cree, false);
  assert.equal(db.tables.crm_le_bookings[0].crm_booking_id, TARGET);
  assert.equal(db.tables.crm_le_bookings[0].status, "linked");
  const moved = db.tables.crm_booking_items.find((row) => row.id === CARD);
  const stayed = db.tables.crm_booking_items.find((row) => row.id === OTHER_CARD);
  assert.equal(moved?.booking_id, TARGET);
  assert.equal(moved?.amount, "1480.00");
  assert.equal(moved?.visible_to_client, true);
  assert.equal(stayed?.booking_id, SOURCE);
  assert.equal(db.tables.crm_booking_documents[0].booking_id, TARGET);
  assert.equal(db.tables.crm_hotel_requests[0].booking_id, TARGET);
  assert.equal(db.tables.crm_trip_costs[0].booking_id, TARGET);
  assert.equal(db.tables.crm_trip_costs[0].amount_eur, "900.00");
  assert.equal(db.tables.crm_booking_cards[0].booking_id, SOURCE);
  assert.equal(db.tables.crm_transactions[0].booking_id, SOURCE);
  assert.equal(db.tables.crm_bookings[0].visible_to_client, true);
  assert.equal(db.tables.crm_bookings[1].visible_to_client, true);
  assert.equal(db.seen.includes("crm_transactions"), false);
  assert.equal(db.seen.includes("crm_booking_cards"), false);
  assert.deepEqual(
    journal.map((row) => row.entityId).sort(),
    [SOURCE, TARGET].sort()
  );
  assert.match(journal[0].summary, /64570SH046735/);
  assert.match(journal[0].summary, /TB-2026-0124/);
  assert.match(journal[0].summary, /TB-2026-0049/);
  assert.equal(db.tables.crm_audit_events.length, 1);
  assert.equal(db.tables.crm_audit_events[0].action, "le_reattach");
  assert.equal(JSON.stringify(db.tables.crm_audit_events).includes("pliant_card"), false);
  const itemWrite = db.writes.find((row) => row.table === "crm_booking_items");
  assert.deepEqual(Object.keys(itemWrite?.payload || {}).sort(), ["booking_id", "sort_order"]);
  assert.equal(db.writes.some((row) => row.table === "crm_transactions" || row.table === "crm_booking_cards"), false);
});

test("un voyageur du dossier cible qui est le client de la réservation suffit", async () => {
  const db = seed({
    traveler: { booking_id: TARGET, first_name: "Jean", last_name: "Morel" },
  });
  const result = await reattachLittleEmperorsReservation(
    { ...move, confirmer: true },
    { admin: db.client, journal: async () => {} }
  );
  assert.equal(result.ecrit, true);
  assert.equal(result.client_coherent, true);
  assert.equal(db.tables.crm_le_bookings[0].crm_booking_id, TARGET);
});

test("déjà sur le dossier cible : rien n’est réécrit", async () => {
  const db = seed();
  db.tables.crm_le_bookings[0].crm_booking_id = TARGET;
  const result = await reattachLittleEmperorsReservation(
    { ...move, confirmer: true, accepterClient: true },
    { admin: db.client, journal: async () => assert.fail("journal") }
  );
  assert.equal(result.deja, true);
  assert.equal(result.ecrit, false);
  assert.equal(db.writes.length, 0);
});

test("un dossier annulé ou archivé est refusé", async () => {
  const cancelled = seed({ targetStatus: "cancelled" });
  await assert.rejects(
    () => reattachLittleEmperorsReservation({ ...move, confirmer: true, accepterClient: true }, { admin: cancelled.client }),
    (err: unknown) => err instanceof LittleEmperorsError && /annulé/.test(err.message)
  );
  const archived = seed({ archived: "2026-01-01T00:00:00.000Z" });
  await assert.rejects(
    () => reattachLittleEmperorsReservation({ ...move, confirmer: true, accepterClient: true }, { admin: archived.client }),
    (err: unknown) => err instanceof LittleEmperorsError && /archivé/.test(err.message)
  );
});

test("une réservation sans dossier reste à l’import", async () => {
  const db = seed();
  db.tables.crm_le_bookings[0].crm_booking_id = null;
  db.tables.crm_le_bookings[0].status = "unmatched";
  await assert.rejects(
    () => reattachLittleEmperorsReservation(move, { admin: db.client }),
    (err: unknown) => err instanceof LittleEmperorsError && /pas rattachée/.test(err.message)
  );
});

test("deux dossiers pour la même référence : refus", async () => {
  const db = seed();
  db.tables.crm_bookings.push({
    id: OTHER,
    reference: "TB-2026-0999",
    customer_id: CLIENT_B,
    status: "confirmed",
    archived_at: null,
    visible_to_client: false,
  });
  db.tables.crm_le_bookings.push({
    id: "le-2",
    confirmation_number: "64570SH046736",
    guest_names: ["Jean Morel"],
    hotel_name: "Four Seasons Milano",
    crm_booking_id: OTHER,
    status: "linked",
  });
  await assert.rejects(
    () => reattachLittleEmperorsReservation(move, { admin: db.client }),
    (err: unknown) => err instanceof LittleEmperorsError && /plusieurs dossiers/.test(err.message)
  );
  assert.equal(db.writes.length, 0);
});

test("l’écran propose l’aperçu avant de rattacher", async () => {
  const { LeReattach } = await import("../../components/admin/LeReattach");
  const html = renderToStaticMarkup(
    createElement(LeReattach, { reference: "64570SH046735", hotelName: "Four Seasons Milano" })
  );
  assert.match(html, /Changer de dossier/);
  assert.match(html, /64570SH046735/);
  assert.match(html, /Four Seasons Milano/);
  assert.match(html, /Dossier cible/);
  assert.match(html, /Aperçu/);
  assert.equal(html.includes("Rattacher"), false);
});

test("le déplacement n’appelle ni le grand livre, ni WhatsApp, ni une carte Pliant", () => {
  const source = readFileSync(new URL("./le-reattach.ts", import.meta.url), "utf8");
  for (const forbidden of ["syncBookingLedger", "crm_booking_cards", "crm_transactions", "whatsapp", "twilio", "crm_pliant"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  const editor = readFileSync(new URL("../../components/admin/BookingEditor.tsx", import.meta.url), "utf8");
  const inbox = readFileSync(new URL("../../components/admin/LittleEmperorsInbox.tsx", import.meta.url), "utf8");
  assert.match(editor, /LeReattach/);
  assert.match(inbox, /LeReattach/);
});
