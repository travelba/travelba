import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderedTwinPair, setCustomerTwin } from "./customer-twins";
import { mergeTripOwnerIds } from "./company-peers";

const BEATRICE = "d8ee22e4-76c4-4c42-9d11-bcaea3552f20";
const GUY = "170736b6-9b21-4865-b97e-d1d6fdaed821";

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "in"; value: unknown };

function memory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function matches(row: Row, filters: Filter[]) {
    return filters.every((filter) =>
      filter.op === "eq" ? row[filter.column] === filter.value : (filter.value as unknown[]).includes(row[filter.column])
    );
  }
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: Filter[] = [];
    let action: "select" | "delete" | "insert" = "select";
    let patch: Row = {};
    const api = {
      select() {
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
        filters.push({ column, op: "eq", value });
        return api;
      },
      in(column: string, value: unknown[]) {
        filters.push({ column, op: "in", value });
        return api;
      },
      maybeSingle() {
        const rows = tables[table].filter((row) => matches(row, filters));
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      then(resolve: (value: { data: unknown; error: null }) => void) {
        const rows = tables[table].filter((row) => matches(row, filters));
        if (action === "delete") tables[table] = tables[table].filter((row) => !rows.includes(row));
        if (action === "insert") tables[table].push({ ...patch });
        resolve({ data: action === "select" ? rows : null, error: null });
      },
    };
    return api;
  }
  return { from, tables };
}

test("la paire est symétrique et refuse une fiche seule", () => {
  const pair = orderedTwinPair(GUY, BEATRICE);
  assert.deepEqual(pair, orderedTwinPair(BEATRICE, GUY));
  assert.equal(pair?.customer_a, GUY);
  assert.equal(pair?.customer_b, BEATRICE);
  assert.equal(orderedTwinPair(BEATRICE, BEATRICE), null);
});

test("les dossiers lus ajoutent les jumeaux sans retirer les collaborateurs", () => {
  assert.deepEqual(mergeTripOwnerIds(["guy", "collab"], ["beatrice"]), ["guy", "collab", "beatrice"]);
});

test("lier sans confirmer n’écrit rien et n’envoie aucun message", async () => {
  const db = memory({
    crm_customers: [
      { id: BEATRICE, first_name: "Béatrice", last_name: "Boukris" },
      { id: GUY, first_name: "Guy", last_name: "Boukris" },
    ],
    crm_bookings: [
      { customer_id: BEATRICE, reference: "TB-2026-0232", visible_to_client: true, archived_at: null, status: "confirmed" },
      { customer_id: BEATRICE, reference: "TB-2026-0233", visible_to_client: false, archived_at: null, status: "draft" },
    ],
    crm_customer_twins: [],
    crm_audit_events: [],
  });
  const preview = await setCustomerTwin(db as unknown as SupabaseClient, {
    clientId: BEATRICE,
    twinId: GUY,
    action: "lier",
  });
  assert.equal(preview.apercu, true);
  assert.equal(preview.applique, false);
  assert.equal(preview.message_envoye, false);
  assert.equal(db.tables.crm_customer_twins.length, 0);
  assert.deepEqual(preview.references_visibles_client, ["TB-2026-0232"]);
  assert.match(preview.message, /Aucun message/);

  const linked = await setCustomerTwin(db as unknown as SupabaseClient, {
    clientId: GUY,
    twinId: BEATRICE,
    action: "lier",
    confirmer: true,
  });
  assert.equal(linked.applique, true);
  assert.equal(linked.message_envoye, false);
  assert.equal(db.tables.crm_customer_twins.length, 1);
  assert.equal(db.tables.crm_audit_events.length, 1);
  assert.equal(db.tables.crm_customer_twins[0].customer_a, GUY);

  const again = await setCustomerTwin(db as unknown as SupabaseClient, {
    clientId: BEATRICE,
    twinId: GUY,
    action: "lier",
    confirmer: true,
  });
  assert.equal(again.deja, true);
  assert.equal(db.tables.crm_customer_twins.length, 1);

  const gone = await setCustomerTwin(db as unknown as SupabaseClient, {
    clientId: BEATRICE,
    twinId: GUY,
    action: "delier",
    confirmer: true,
  });
  assert.equal(gone.applique, true);
  assert.equal(db.tables.crm_customer_twins.length, 0);
});
