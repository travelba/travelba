import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dossierMergeSummary, mergeDossierInto } from "./dossier-merge";

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [key, rows] of Object.entries(seed)) tables[key] = rows.map((row) => ({ ...row }));
  const writes: { table: string; op: string; payload: unknown }[] = [];

  function from(table: string) {
    const filters: { kind: "eq" | "in"; column: string; value: unknown }[] = [];
    let op: "select" | "update" | "delete" | "insert" = "select";
    let payload: unknown = null;
    const match = (row: Row) =>
      filters.every((filter) => {
        if (filter.kind === "eq") return row[filter.column] === filter.value;
        return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
      });
    const run = () => {
      const all = tables[table] || [];
      if (op === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Row[];
        tables[table] = [...all, ...rows];
        writes.push({ table, op, payload });
        return { data: null, error: null };
      }
      const hit = all.filter(match);
      if (op === "select") return { data: hit, error: null };
      if (op === "update") {
        for (const row of hit) Object.assign(row, payload as Row);
        writes.push({ table, op, payload });
        return { data: null, error: null };
      }
      tables[table] = all.filter((row) => !hit.includes(row));
      writes.push({ table, op, payload: hit.map((row) => row.id) });
      return { data: null, error: null };
    };
    const api = {
      select() {
        return api;
      },
      update(value: unknown) {
        op = "update";
        payload = value;
        return api;
      },
      insert(value: unknown) {
        op = "insert";
        payload = value;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push({ kind: "eq", column, value });
        return api;
      },
      in(column: string, value: unknown) {
        filters.push({ kind: "in", column, value });
        return api;
      },
      maybeSingle() {
        const result = run();
        const rows = (result.data || []) as Row[];
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(onOk, onErr);
      },
    };
    return api;
  }

  return { admin: { from } as unknown as SupabaseClient, tables, writes };
}

const KEEP = "11111111-1111-4111-8111-111111111111";
const DROP = "22222222-2222-4222-8222-222222222222";

test("le résumé nomme le dossier retiré et ce qui part", () => {
  const summary = dossierMergeSummary({
    keepReference: "TB-2026-0098",
    dropReference: "TB-2026-0102",
    movedCards: ["Park Hyatt"],
    skippedCards: ["Paris → Rome"],
    movedTravelers: ["David Berda"],
    skippedTravelers: ["Léa Martin"],
    documentCount: 1,
  });
  assert.match(summary, /TB-2026-0102 réuni dans TB-2026-0098/);
  assert.match(summary, /Park Hyatt/);
  assert.match(summary, /Paris → Rome/);
  assert.match(summary, /David Berda/);
  assert.match(summary, /Léa Martin/);
  assert.match(summary, /1 pièce déplacée/);
});

test("la réunion écrit le journal et retire le doublon", async () => {
  const { admin, tables, writes } = memoryAdmin({
    crm_booking_cards: [],
    crm_bookings: [
      { id: KEEP, reference: "TB-2026-0098", customer_id: "client-1", title: "Rome", destination: "Rome" },
      { id: DROP, reference: "TB-2026-0102", customer_id: "client-1", title: "Rome", destination: "Rome" },
    ],
    crm_booking_items: [
      {
        id: "item-keep",
        booking_id: KEEP,
        kind: "flight",
        title: "Paris → Rome",
        confirmation_ref: "YQYS8U",
        start_at: "2026-12-17T13:20:00",
        end_at: null,
        details: { flight_number: "AF258" },
      },
      {
        id: "item-same",
        booking_id: DROP,
        kind: "flight",
        title: "Paris → Rome",
        confirmation_ref: "YQYS8U",
        start_at: "2026-12-17T13:20:00",
        end_at: null,
        details: { flight_number: "AF258" },
      },
      {
        id: "item-hotel",
        booking_id: DROP,
        kind: "hotel",
        title: "Park Hyatt",
        confirmation_ref: "97620170",
        start_at: "2026-12-17",
        end_at: "2026-12-20",
        details: { hotel_name: "Park Hyatt" },
      },
    ],
    crm_booking_travelers: [
      { id: "trav-keep", booking_id: KEEP, first_name: "David", last_name: "Berda" },
      { id: "trav-same", booking_id: DROP, first_name: "David", last_name: "Berda" },
      { id: "trav-new", booking_id: DROP, first_name: "Léa", last_name: "Martin" },
    ],
    crm_booking_documents: [{ id: "doc-1", booking_id: DROP, file_name: "confirmation.pdf" }],
    crm_le_bookings: [],
    crm_email_ingest: [],
    crm_audit_events: [],
    crm_agency_journal: [],
    crm_customers: [],
  });
  const result = await mergeDossierInto(admin, KEEP, DROP);
  assert.equal(result.ok, true);
  assert.equal(tables.crm_bookings.some((row) => row.id === DROP), false);
  assert.equal(tables.crm_booking_items.find((row) => row.id === "item-hotel")?.booking_id, KEEP);
  assert.equal(tables.crm_booking_items.some((row) => row.id === "item-same"), false);
  assert.equal(tables.crm_booking_travelers.find((row) => row.id === "trav-new")?.booking_id, KEEP);
  assert.equal(tables.crm_booking_documents[0]?.booking_id, KEEP);
  const audit = writes.find((row) => row.table === "crm_audit_events" && row.op === "insert");
  const activity = writes.find((row) => row.table === "crm_agency_journal" && row.op === "insert");
  assert.ok(audit);
  assert.ok(activity);
  const summary = String((audit?.payload as { summary?: string })?.summary || "");
  assert.match(summary, /TB-2026-0102/);
  assert.match(summary, /TB-2026-0098/);
  assert.match(summary, /Park Hyatt/);
  assert.match(summary, /Léa Martin/);
  assert.match(summary, /confirmation\.pdf|1 pièce/);
  const detail = (audit?.payload as { detail?: { dossier_retire?: string; cartes_deplacees?: string[] } }).detail;
  assert.equal(detail?.dossier_retire, DROP);
  assert.deepEqual(detail?.cartes_deplacees, ["Park Hyatt"]);
  assert.equal((activity?.payload as { entity_id?: string }).entity_id, KEEP);
  assert.equal((activity?.payload as { action?: string }).action, "update");
});

test("un dossier Visible n’absorbe pas le dossier fournisseur", async () => {
  const { admin, tables, writes } = memoryAdmin({
    crm_booking_cards: [],
    crm_bookings: [
      { id: KEEP, reference: "TB-2026-0098", customer_id: "client-1", visible_to_client: true },
      { id: DROP, reference: "TB-2026-0102", customer_id: "client-1", visible_to_client: false },
    ],
    crm_booking_items: [
      {
        id: "item-fake",
        booking_id: DROP,
        kind: "flight",
        title: "Paris → Rome",
        confirmation_ref: "ABC123",
        start_at: "2022-01-01",
        details: { needs_review: true, flight_number: "AF123" },
      },
    ],
    crm_booking_travelers: [{ id: "trav-fake", booking_id: DROP, first_name: "John", last_name: "Doe" }],
    crm_booking_documents: [],
    crm_audit_events: [],
    crm_agency_journal: [],
  });
  const result = await mergeDossierInto(admin, KEEP, DROP);
  assert.equal(result.ok, false);
  assert.match(result.message || "", /Visible/);
  assert.equal(tables.crm_bookings.some((row) => row.id === DROP), true);
  assert.equal(tables.crm_booking_items[0]?.booking_id, DROP);
  assert.equal(tables.crm_booking_travelers[0]?.booking_id, DROP);
  const audit = writes.find((row) => row.table === "crm_audit_events" && row.op === "insert");
  assert.equal((audit?.payload as { action?: string })?.action, "reunion_proposee");
  assert.match(String((audit?.payload as { summary?: string })?.summary || ""), /TB-2026-0102/);
  const again = await mergeDossierInto(admin, KEEP, DROP);
  assert.equal(again.ok, false);
  assert.equal(writes.filter((row) => row.table === "crm_audit_events" && row.op === "insert").length, 1);
});

test("une carte à vérifier n’est pas déplacée vers le dossier du client", async () => {
  const { admin, tables } = memoryAdmin({
    crm_booking_cards: [],
    crm_bookings: [
      { id: KEEP, reference: "TB-2026-0098", customer_id: "client-1", visible_to_client: false },
      { id: DROP, reference: "TB-2026-0102", customer_id: "client-1", visible_to_client: false },
    ],
    crm_booking_items: [
      {
        id: "item-ok",
        booking_id: DROP,
        kind: "hotel",
        title: "Park Hyatt",
        confirmation_ref: "97620170",
        start_at: "2026-12-17",
        details: { hotel_name: "Park Hyatt" },
      },
      {
        id: "item-review",
        booking_id: DROP,
        kind: "flight",
        title: "Paris → Rome",
        confirmation_ref: "ABC123",
        start_at: "2026-12-17",
        details: { needs_review: true, email_ingest_id: "mail-1" },
      },
    ],
    crm_booking_travelers: [{ id: "trav-new", booking_id: DROP, first_name: "Jane", last_name: "Doe" }],
    crm_booking_documents: [],
    crm_audit_events: [],
    crm_agency_journal: [],
  });
  const result = await mergeDossierInto(admin, KEEP, DROP);
  assert.equal(result.ok, false);
  assert.match(result.message || "", /à vérifier/);
  assert.equal(tables.crm_booking_items.find((row) => row.id === "item-ok")?.booking_id, KEEP);
  assert.equal(tables.crm_booking_items.find((row) => row.id === "item-review")?.booking_id, DROP);
  assert.equal(tables.crm_booking_travelers[0]?.booking_id, DROP);
  assert.equal(tables.crm_bookings.some((row) => row.id === DROP), true);
});

test("une carte bancaire bloque la réunion, sans journal", async () => {
  const { admin, writes, tables } = memoryAdmin({
    crm_booking_cards: [{ id: "card-1", booking_id: DROP }],
    crm_bookings: [
      { id: KEEP, reference: "TB-2026-0098" },
      { id: DROP, reference: "TB-2026-0102" },
    ],
  });
  const result = await mergeDossierInto(admin, KEEP, DROP);
  assert.equal(result.ok, false);
  assert.match(result.message || "", /carte bancaire/);
  assert.equal(writes.some((row) => row.table === "crm_audit_events"), false);
  assert.equal(tables.crm_bookings.length, 2);
});
