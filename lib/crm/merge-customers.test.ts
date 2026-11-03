import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conflictingIdentityDocs, mergeCustomers } from "./merge-customers";
import { LedgerVoidError, voidManualLedgerMovement } from "./ledger-void";

const KEEP = "a67a720e-149f-41f3-a4f1-a1fa3ffad3f4";
const DROP = "1390e7b5-c107-4e36-ae20-770ecedff55e";
const MOVE = "258ed545-cf13-48eb-a407-c7c91d71a180";

type Row = Record<string, unknown>;

function memory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: [string, unknown][] = [];
    let action: "select" | "update" | "delete" | "insert" = "select";
    let patch: Row = {};
    const api = {
      select() {
        action = "select";
        return api;
      },
      update(row: Row) {
        action = "update";
        patch = row;
        return api;
      },
      insert(row: Row) {
        action = "insert";
        patch = row;
        return api;
      },
      delete() {
        action = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      maybeSingle() {
        const rows = tables[table].filter((row) => filters.every(([column, value]) => row[column] === value));
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      then(resolve: (value: { data: unknown; error: null }) => void) {
        const rows = tables[table].filter((row) => filters.every(([column, value]) => row[column] === value));
        if (action === "update") {
          for (const row of rows) Object.assign(row, patch);
        } else if (action === "delete") {
          tables[table] = tables[table].filter((row) => !rows.includes(row));
        } else if (action === "insert") {
          tables[table].push({ ...patch });
        }
        resolve({ data: action === "select" ? rows : null, error: null });
      },
    };
    return api;
  }
  return { from, tables };
}

test("deux passeports différents bloquent la fusion", () => {
  const clashes = conflictingIdentityDocs(
    [{ id: "a", customer_id: KEEP, doc_type: "passport", number: "12AB45678", companion_id: null }],
    [{ id: "b", customer_id: DROP, doc_type: "passport", number: "99ZZ00001", companion_id: null }]
  );
  assert.deepEqual(clashes, ["passeport"]);
  assert.deepEqual(
    conflictingIdentityDocs(
      [{ id: "a", customer_id: KEEP, doc_type: "passport", number: "12AB45678", companion_id: null }],
      [{ id: "b", customer_id: DROP, doc_type: "passport", number: "12 AB 45678", companion_id: null }]
    ),
    []
  );
});

test("la fusion déplace le dossier et le débit, puis retire le doublon", async () => {
  const db = memory({
    crm_customers: [
      { id: KEEP, first_name: "Norman", last_name: "Cohen", email: "norman@example.com", phone: null, company_name: null, auth_user_id: null },
      { id: DROP, first_name: "Cohen", last_name: "Normann", email: "ingest@invalid.local", phone: "+33600000000", company_name: null, auth_user_id: null },
    ],
    crm_bookings: [{ id: "b1", customer_id: DROP, billing_customer_id: DROP }],
    crm_transactions: [{ id: MOVE, customer_id: DROP, booking_id: "b1", source: "manual", direction: "debit", status: "posted" }],
    crm_travel_documents: [],
    crm_audit_events: [],
  });
  await assert.rejects(
    () => mergeCustomers(db as unknown as SupabaseClient, { keepId: KEEP, dropId: DROP, confirmer: "Cohen" }),
    /nom complet/
  );
  assert.equal(db.tables.crm_customers.length, 2);
  const done = await mergeCustomers(db as unknown as SupabaseClient, {
    keepId: KEEP,
    dropId: DROP,
    confirmer: "Norman Cohen",
  });
  assert.equal(done.fusionne, true);
  assert.equal(db.tables.crm_bookings[0]?.customer_id, KEEP);
  assert.equal(db.tables.crm_transactions[0]?.customer_id, KEEP);
  assert.equal(db.tables.crm_customers.some((row) => row.id === DROP), false);
  assert.equal(db.tables.crm_customers[0]?.phone, "+33600000000");
  assert.equal(db.tables.crm_customers[0]?.email, "norman@example.com");
});

test("annuler un débit manuel exige confirmer et n’efface pas le crédit", async () => {
  const db = memory({
    crm_transactions: [
      { id: MOVE, source: "manual", status: "posted", direction: "debit", amount: 1785, currency: "EUR", label: "Séjour", customer_id: KEEP, booking_id: "b1" },
    ],
    crm_audit_events: [],
  });
  const admin = db as unknown as SupabaseClient;
  await assert.rejects(() => voidManualLedgerMovement(admin, "pas-un-id", "agence"), LedgerVoidError);
  const result = await voidManualLedgerMovement(admin, MOVE, "agence");
  assert.equal(result.annule, true);
  assert.equal(db.tables.crm_transactions[0]?.status, "void");
  assert.equal(db.tables.crm_audit_events.length, 1);
});
