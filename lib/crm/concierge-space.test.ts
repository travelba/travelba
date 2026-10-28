import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyClientSpace } from "./client-space-catalog";
import { performClientSpace, type SpacePerformInput } from "./concierge-space";
import type { ConciergeTraveler } from "./concierge-client-write";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMPANION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VOYAGEUR = "81844f9d-cd14-44c4-8f1d-5f054407d2be";

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] = {};
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
      in() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      then(resolve: (value: { data: Row[] | null; error: { message?: string } | null }) => void) {
        return Promise.resolve(list()).then(resolve);
      },
    };
    function matched() {
      return tables[table].filter((row) => filters.every((filter) => filter(row)));
    }
    function apply() {
      if (op === "insert") {
        const row = { ...(payload as Row), id: (payload as Row).id || "00000000-0000-4000-8000-000000000099" };
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
        return removed.map((row) => ({ ...row, storage_path: row.storage_path || null }));
      }
      return matched();
    }
    function list() {
      return { data: apply(), error: null };
    }
    function finish(allowEmpty: boolean) {
      const rows = apply();
      if (rows.length === 1) return { data: rows[0], error: null };
      if (allowEmpty && rows.length === 0) return { data: null, error: null };
      return { data: null, error: { message: "several" } };
    }
    return api;
  }
  return { from, tables };
}

const victoria: ConciergeTraveler = {
  voyageurId: VOYAGEUR,
  bookingId: BOOKING,
  reference: "TB-2026-0096",
  customerId: CLIENT,
  firstName: "Victoria Marie Rebecca",
  lastName: "Martin",
  usageName: null,
  companionId: COMPANION,
  isHolder: false,
  phone: null,
  email: null,
  birthDate: null,
};

function input(partial: Partial<SpacePerformInput> & { message: string; id: string; name?: string | null }): SpacePerformInput {
  const action = classifyClientSpace(partial.message) || {
    id: partial.id,
    tool: partial.id,
    name: partial.name || null,
    reference: null,
    access: false,
  };
  return {
    action: { ...action, id: partial.id },
    message: partial.message,
    customerId: CLIENT,
    holder: partial.holder ?? true,
    staff: false,
    staffId: null,
    party: partial.party || [victoria],
    hasFile: false,
    piecePath: null,
  };
}

test("l’annulation d’hôtel suit le titulaire, et le compagnon est renvoyé vers le conseiller", async () => {
  const db = memoryAdmin({
    crm_booking_items: [{ id: "hotel-1", booking_id: BOOKING, kind: "hotel", title: "Mondrian", supplier: null, details: { hotel_name: "Mondrian" } }],
    crm_audit_events: [],
    crm_customer_activity: [],
  });
  let called = false;
  const denied = await performClientSpace(
    db as unknown as SupabaseClient,
    input({ message: "Annule l’hôtel Mondrian", id: "annuler_hotel", holder: false }),
    { cancelHotel: async () => ({ ok: true }) }
  );
  assert.equal(denied.ok, false);
  assert.match(denied.summary, /Contactez votre conseiller/);
  assert.equal(denied.handoff, "cancel");
  const allowed = await performClientSpace(
    db as unknown as SupabaseClient,
    input({ message: "Annule l’hôtel Mondrian", id: "annuler_hotel", holder: true }),
    {
      cancelHotel: async () => {
        called = true;
        return { ok: true, sent: true };
      },
    }
  );
  assert.equal(called, true);
  assert.equal(allowed.ok, true);
  assert.match(allowed.summary, /J’ai annulé l’hôtel Mondrian/);
  assert.equal(JSON.stringify(db.tables.crm_audit_events).includes("P<"), false);
});

test("l’IBAN est enregistré sans être répété, et l’import reste à l’agence", async () => {
  const db = memoryAdmin({
    crm_customers: [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }],
    crm_audit_events: [],
    crm_customer_activity: [],
  });
  const iban = await performClientSpace(
    db as unknown as SupabaseClient,
    input({ message: "Mon IBAN est FR7630006000011234567890189", id: "modifier_fiche" })
  );
  assert.equal(iban.ok, true);
  assert.equal(iban.summary.includes("FR76"), false);
  assert.match(iban.summary, /IBAN/);
  const imported = await performClientSpace(
    db as unknown as SupabaseClient,
    input({ message: "Importe ce PDF dans le dossier", id: "import_dossier" })
  );
  assert.match(imported.summary, /uniquement par l’agence/);
});

test("le règlement n’est pas encaissé dans le fil", async () => {
  const db = memoryAdmin({
    crm_customers: [{ id: CLIENT, company_role: "member" }],
  });
  const member = await performClientSpace(
    db as unknown as SupabaseClient,
    input({ message: "Je veux payer mon encours", id: "regler_encours" })
  );
  assert.match(member.summary, /compte qui porte l’encours/);
  assert.equal(member.handoff, null);
  const holder = await performClientSpace(
    memoryAdmin({ crm_customers: [{ id: CLIENT, company_role: null }] }) as unknown as SupabaseClient,
    input({ message: "Je veux payer mon encours", id: "regler_encours" })
  );
  assert.match(holder.summary, /Transactions/);
  assert.match(holder.summary, /moyen de règlement/);
  assert.equal(holder.access, true);
});

test("un service du séjour appelle la même validation que le bouton", async () => {
  const db = memoryAdmin({});
  let seen = "";
  const asked = await performClientSpace(
    db as unknown as SupabaseClient,
    input({ message: "Je veux un enregistrement en ligne", id: "demander_service" }),
    {
      runService: async (_admin, row) => {
        seen = row.message;
        return { ok: true, summary: "J’ai demandé l’enregistrement en ligne." };
      },
    }
  );
  assert.match(seen, /enregistrement/);
  assert.equal(asked.ok, true);
  const missing = await performClientSpace(
    db as unknown as SupabaseClient,
    input({ message: "Je veux un chauffeur", id: "demander_service" })
  );
  assert.match(missing.summary, /véhicule/);
});
