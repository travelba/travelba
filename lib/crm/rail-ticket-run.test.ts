import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runRailTickets } from "./rail-ticket-run";

const BOOKING = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const CUSTOMER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const OUT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BACK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const DOC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

const TICKET = `
DIMANCHE 20 DÉCEMBRE 2026
12h46 PARIS GARE DE LYON
15h36 CHAMBERY-CHALLES-LES-EAUX
TGV INOUI 6941 - 1e CLASSE
Voiture 2 Haut - Place 12
DIMANCHE 27 DÉCEMBRE 2026
13h24 CHAMBERY-CHALLES-LES-EAUX
16h15 PARIS GARE DE LYON
TGV INOUI 6972 - 1e CLASSE
Voiture 11 Haut - Place 17
`;

type Row = Record<string, unknown>;

function memory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const writes: { table: string; op: string; row?: Row }[] = [];
  let seq = 1;
  function from(table: string) {
    const filters: { op: string; col: string; val: unknown }[] = [];
    const match = () =>
      (tables[table] || []).filter((row) =>
        filters.every((filter) => {
          const value = row[filter.col];
          if (filter.op === "eq") return value === filter.val;
          if (filter.op === "neq") return value !== filter.val;
          if (filter.op === "in") return Array.isArray(filter.val) && filter.val.includes(value);
          if (filter.op === "is") return value == null;
          const raw = String(value).includes("T") ? String(value) : String(value).replace(" ", "T");
          const left = Date.parse(raw.replace(/([+-]\d{2})$/, "$1:00"));
          const right = Date.parse(String(filter.val));
          if (filter.op === "gte") return left >= right;
          if (filter.op === "lte") return left <= right;
          return true;
        })
      );
    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push({ op: "eq", col, val });
        return builder;
      },
      neq(col: string, val: unknown) {
        filters.push({ op: "neq", col, val });
        return builder;
      },
      in(col: string, val: unknown[]) {
        filters.push({ op: "in", col, val });
        return builder;
      },
      is(col: string, val: unknown) {
        filters.push({ op: "is", col, val });
        return builder;
      },
      gte(col: string, val: string) {
        filters.push({ op: "gte", col, val });
        return builder;
      },
      lte(col: string, val: string) {
        filters.push({ op: "lte", col, val });
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle: async () => ({ data: match()[0] || null, error: null }),
      insert: async (row: Row) => {
        if (row.dedupe_key && (tables[table] || []).some((item) => item.dedupe_key === row.dedupe_key)) {
          return { error: { code: "23505", message: "duplicate" } };
        }
        const stored = { ...row, id: row.id || `id-${seq++}`, created_at: row.created_at || "2026-12-20T10:50:00.000Z" };
        (tables[table] ||= []).push(stored);
        writes.push({ table, op: "insert", row: stored });
        return { error: null };
      },
      update(row: Row) {
        const next = {
          ...builder,
          eq(col: string, val: unknown) {
            filters.push({ op: "eq", col, val });
            return next;
          },
          then(onFulfilled: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
            for (const item of match()) Object.assign(item, row);
            writes.push({ table, op: "update", row });
            return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
          },
        };
        return next;
      },
      then(onFulfilled: (value: { data: Row[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: match(), error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }
  return { from, tables, writes };
}

function world(patch?: { visible?: boolean; optOut?: boolean; optIn?: string | null; kind?: string }) {
  return memory({
    crm_bookings: [
      {
        id: BOOKING,
        reference: "TB-2026-9001",
        customer_id: CUSTOMER,
        status: "confirmed",
        visible_to_client: patch?.visible !== false,
        archived_at: null,
      },
    ],
    crm_booking_items: [
      {
        id: OUT,
        booking_id: BOOKING,
        kind: "rail",
        title: "TGV INOUI 6941 Paris Gare de Lyon → Chambéry-Challes-les-Eaux, 1re",
        supplier: "SNCF",
        start_at: "2026-12-20 12:46:00+00",
        visible_to_client: true,
        lifecycle: "active",
        details: { voiture: "2" },
      },
      {
        id: BACK,
        booking_id: BOOKING,
        kind: "rail",
        title: "TGV INOUI 6972 Chambéry-Challes-les-Eaux → Paris Gare de Lyon, 1re",
        supplier: "SNCF",
        start_at: "2026-12-27 13:24:00+00",
        visible_to_client: true,
        lifecycle: "active",
        details: { voiture: "11" },
      },
    ],
    crm_customers: [
      {
        id: CUSTOMER,
        first_name: "Camille",
        phone: "+33600000000",
        whatsapp_opt_in_at: patch?.optIn === undefined ? "2026-01-01T00:00:00Z" : patch.optIn,
        whatsapp_opt_out_at: patch?.optOut ? "2026-02-01T00:00:00Z" : null,
      },
    ],
    crm_booking_documents: [
      {
        id: DOC,
        booking_id: BOOKING,
        booking_item_id: null,
        kind: patch?.kind || "carte d'embarquement",
        file_name: "PARIS_GARE_DE_LYON-CHAMBERY_20-12-26_VOYAGEUR.pdf",
        mime_type: "application/pdf",
        storage_path: "bookings/billet.pdf",
        visible_to_client: false,
        extracted: null,
      },
    ],
    crm_whatsapp_messages: [],
    crm_customer_activity: [],
    crm_audit_events: [],
  });
}

const winter = new Date("2026-12-20T10:50:00.000Z");

test("à H-1 en hiver le PDF part une fois, reste masqué, et ne repart pas", async () => {
  const db = world();
  const sent: string[] = [];
  const first = await runRailTickets(db as unknown as SupabaseClient, {
    now: winter,
    readText: async () => TICKET,
    resolveSid: async (env) => (env.endsWith("BILLET_TRAIN") ? null : "HXdoc"),
    sendTemplate: async (input) => {
      sent.push(input.contentSid);
      assert.match(`${input.variables?.["2"] || ""} ${input.variables?.["3"] || ""}`, /Camille/);
      assert.match(`${input.variables?.["3"] || ""}`, /6941/);
      return { ok: true, sid: "SM1" };
    },
    sendSession: async () => ({ ok: false }),
    signBoarding: () => "token/Billet-train.pdf",
    signFree: () => "token/Billet-train.pdf",
  });
  assert.equal(first.envoyes, 1);
  assert.equal(first.trains[0], "TB-2026-9001 · TGV INOUI 6941");
  assert.equal(sent[0], "HXdoc");
  assert.equal(db.tables.crm_booking_documents[0]?.visible_to_client, false);
  assert.equal(db.writes.some((write) => write.table === "crm_booking_documents" || write.table === "crm_booking_items"), false);
  assert.equal(db.tables.crm_whatsapp_messages[0]?.status, "sent");
  assert.match(String(db.tables.crm_whatsapp_messages[0]?.dedupe_key), new RegExp(OUT));
  assert.equal(db.tables.crm_whatsapp_messages[0]?.template_key, "message_libre_document");
  const second = await runRailTickets(db as unknown as SupabaseClient, {
    now: winter,
    readText: async () => TICKET,
    resolveSid: async () => "HXdoc",
    sendTemplate: async () => {
      throw new Error("second envoi");
    },
    signFree: () => "token/Billet-train.pdf",
    signBoarding: () => "token/Billet-train.pdf",
  });
  assert.equal(second.deja, 1);
  assert.equal(second.envoyes, 0);
});

test("le retour du même PDF part à son heure, un essai n’écrit rien, un opt-out non plus", async () => {
  const db = world();
  const preview = await runRailTickets(db as unknown as SupabaseClient, {
    now: new Date("2026-12-27T11:30:00.000Z"),
    dryRun: true,
    readText: async () => TICKET,
    resolveSid: async () => "HXtrain",
    sendTemplate: async () => {
      throw new Error("essai");
    },
    signBoarding: () => "token/Billet.pdf",
    signFree: () => "token/Billet.pdf",
  });
  assert.equal(preview.essai, true);
  assert.equal(preview.prevus, 1);
  assert.equal(preview.envoyes, 0);
  assert.equal(db.writes.length, 0);
  const hidden = world({ visible: false });
  const skipped = await runRailTickets(hidden as unknown as SupabaseClient, {
    now: winter,
    readText: async () => TICKET,
    resolveSid: async () => "HXdoc",
    sendTemplate: async () => ({ ok: true, sid: "SM" }),
    signFree: () => "token/Billet.pdf",
  });
  assert.equal(skipped.envoyes, 0);
  const opted = world({ optOut: true });
  const no = await runRailTickets(opted as unknown as SupabaseClient, {
    now: winter,
    readText: async () => TICKET,
    resolveSid: async () => "HXdoc",
    sendTemplate: async () => ({ ok: true, sid: "SM" }),
    signFree: () => "token/Billet.pdf",
  });
  assert.equal(no.envoyes, 0);
  assert.equal(no.ignores > 0, true);
});
