import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addVoyageur } from "@/lib/crm/mcp-trip";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { updateVoyageur } from "@/lib/crm/traveler-update";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMPANION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VOYAGEUR = "81844f9d-cd14-44c4-8f1d-5f054407d2be";
const HOLDER_TRAVELER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    const api = {
      select() {
        return api;
      },
      insert(value: Row) {
        op = "insert";
        payload = value;
        return api;
      },
      update(value: Row) {
        op = "update";
        payload = value;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        const allowed = new Set(values);
        filters.push((row) => allowed.has(row[column]));
        return api;
      },
      is() {
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      single() {
        return Promise.resolve(finish(false));
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void) {
        return Promise.resolve(list()).then(resolve);
      },
    };
    function matched() {
      return tables[table].filter((row) => filters.every((filter) => filter(row)));
    }
    function apply() {
      if (op === "insert") {
        const row = { ...payload, id: payload.id || "00000000-0000-4000-8000-000000000099" };
        tables[table].push(row);
        return [row];
      }
      if (op === "update") {
        const hits = matched();
        for (const row of hits) Object.assign(row, payload);
        return hits;
      }
      if (op === "delete") {
        const removed = matched();
        tables[table] = tables[table].filter((row) => !removed.includes(row));
        return removed;
      }
      return matched();
    }
    function list() {
      return { data: apply(), error: null as null };
    }
    function finish(allowEmpty: boolean) {
      const rows = apply();
      if (rows.length === 1) return { data: rows[0], error: null };
      if (allowEmpty && rows.length === 0) return { data: null, error: null };
      return { data: null, error: { message: "several", code: "PGRST116" } };
    }
    return api;
  }
  return { from, tables };
}

function seed() {
  return memoryAdmin({
    crm_customers: [
      {
        id: CLIENT,
        first_name: "Camille",
        last_name: "Martin",
        phone: "+33601020304",
        email: "camille@example.com",
        birth_date: "1980-01-02",
      },
    ],
    crm_bookings: [{ id: BOOKING, reference: "TB-2026-0096", customer_id: CLIENT }],
    crm_travel_companions: [
      {
        id: COMPANION,
        customer_id: CLIENT,
        first_name: "Victoria Marie Rebecca",
        last_name: "Martin",
        phone: null,
        email: null,
        loyalty: {},
      },
    ],
    crm_booking_travelers: [
      {
        id: VOYAGEUR,
        booking_id: BOOKING,
        companion_id: COMPANION,
        is_account_holder: false,
        first_name: "Victoria Marie Rebecca",
        last_name: "Martin",
      },
      {
        id: HOLDER_TRAVELER,
        booking_id: BOOKING,
        companion_id: null,
        is_account_holder: true,
        first_name: "Camille",
        last_name: "Martin",
      },
    ],
    crm_travel_documents: [],
  });
}

test("modifier_voyageur met le téléphone sur le compagnon, par voyageur_id", async () => {
  const db = seed();
  const saved = await updateVoyageur(
    { voyageur_id: VOYAGEUR, telephone: "06 12 34 56 78" },
    db as unknown as SupabaseClient
  );
  assert.equal(saved.voyageur_id, VOYAGEUR);
  assert.equal(saved.telephone, "+33612345678");
  assert.equal(saved.ecrit, true);
  const companion = db.tables.crm_travel_companions[0];
  assert.equal(companion.phone, "+33612345678");
  assert.equal("number" in companion, false);
  assert.equal(JSON.stringify(db.tables).includes("12AB34567"), false);
});

test("ajouter_voyageur refuse ce voyageur_id comme compagnon", async () => {
  const db = seed();
  await assert.rejects(
    () => addVoyageur({ dossier_id: BOOKING, compagnon_id: VOYAGEUR }, db as unknown as SupabaseClient),
    (err: unknown) => err instanceof McpWriteError && /n’est pas sur la fiche du client/.test(err.message)
  );
});

test("un autre client et l’e-mail du titulaire sont refusés", async () => {
  const db = seed();
  await assert.rejects(
    () => updateVoyageur({ voyageur_id: VOYAGEUR, telephone: "0612345678" }, db as unknown as SupabaseClient, { customerId: OTHER }),
    /pas sur le dossier de ce client/
  );
  await assert.rejects(
    () => updateVoyageur({ voyageur_id: HOLDER_TRAVELER, email: "autre@example.com" }, db as unknown as SupabaseClient),
    /mettre_a_jour_client/
  );
  const saved = await updateVoyageur(
    { voyageur_id: VOYAGEUR, email: "victoria.contact@example.com" },
    db as unknown as SupabaseClient
  );
  assert.equal(saved.email, "victoria.contact@example.com");
  assert.equal(db.tables.crm_travel_companions[0].email, "victoria.contact@example.com");
});
