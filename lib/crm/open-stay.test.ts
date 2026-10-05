import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openStayForVisa, setCarnetPublished } from "./bookings";
import type { CrmBooking } from "./types";

type Write = { table: string; op: string; payload: unknown; filters: { method: string; args: unknown[] }[] };

/** Faux client PostgREST : les lectures renvoient l’état donné, les écritures sont journalisées. */
function fakeSupabase(state: {
  booking: Record<string, unknown>;
  items: Record<string, unknown>[];
  documents: Record<string, unknown>[];
}) {
  const writes: Write[] = [];
  function rowsFor(table: string) {
    if (table === "crm_bookings") return [state.booking];
    if (table === "crm_booking_items") return state.items;
    if (table === "crm_booking_documents") return state.documents;
    return [];
  }
  function from(table: string) {
    const calls: { method: string; args: unknown[] }[] = [];
    const proxy: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const first = calls[0];
            let result: { data: unknown; error: null } = { data: null, error: null };
            if (first && (first.method === "update" || first.method === "insert" || first.method === "delete")) {
              writes.push({ table, op: first.method, payload: first.args[0], filters: calls.slice(1) });
              if (first.method === "update" && table === "crm_bookings") {
                Object.assign(state.booking, first.args[0] as Record<string, unknown>);
              }
            } else if (first?.method === "select") {
              const single = calls.some((c) => c.method === "maybeSingle" || c.method === "single");
              const rows = rowsFor(table);
              result = { data: single ? (rows[0] ?? null) : rows, error: null };
            }
            return (onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) =>
              Promise.resolve(result).then(onOk, onErr);
          }
          return (...args: unknown[]) => {
            calls.push({ method: String(prop), args });
            return proxy;
          };
        },
      }
    );
    return proxy;
  }
  return { client: { from } as unknown as SupabaseClient, writes };
}

function booking(partial: Partial<CrmBooking>): CrmBooking {
  return {
    id: "b1",
    customer_id: "c1",
    billing_customer_id: "c1",
    reference: "TB-2026-0001",
    title: "Tel Aviv",
    status: "confirmed",
    currency: "EUR",
    total_amount: 1000,
    include_in_ledger: true,
    visible_to_client: false,
    prices_visible: true,
    archived_at: null,
    ...partial,
  } as CrmBooking;
}

const cards = [
  { id: "i1", kind: "flight", title: "Paris → Tel Aviv", amount: null, include_in_ledger: false, details: {} },
  { id: "i2", kind: "hotel", title: "Hôtel", amount: null, include_in_ledger: false, details: { client_hidden: true } },
];
const documents = [
  { id: "d1", booking_item_id: "i1" },
  { id: "d2", booking_item_id: "i2" },
  { id: "d3", booking_item_id: null },
];

test("la formalité ouvre le séjour sans les prix, révèle cartes et pièces, écrit le grand livre", async () => {
  const hidden = booking({ visible_to_client: false, prices_visible: true });
  const { client, writes } = fakeSupabase({ booking: { ...hidden }, items: cards, documents });
  const result = await openStayForVisa(client, hidden);
  assert.equal(result.newlyPublished, true);

  const publish = writes.find((w) => w.table === "crm_bookings" && w.op === "update");
  assert.deepEqual(publish?.payload, { visible_to_client: true, prices_visible: false });

  const revealItems = writes.find((w) => w.table === "crm_booking_items" && w.op === "update");
  assert.deepEqual(revealItems?.payload, { visible_to_client: true });
  assert.deepEqual(revealItems?.filters[0], { method: "in", args: ["id", ["i1"]] });

  const revealDocs = writes.find((w) => w.table === "crm_booking_documents" && w.op === "update");
  assert.deepEqual(revealDocs?.filters[0], { method: "in", args: ["id", ["d1", "d3"]] });

  const debit = writes.find((w) => w.table === "crm_transactions" && w.op === "insert") as
    | (Write & { payload: Record<string, unknown> })
    | undefined;
  assert.ok(debit, "le débit séjour est posté");
  assert.equal(debit.payload.kind, "booking");
  assert.equal(debit.payload.amount, 1000);
  assert.equal(debit.payload.booking_id, "b1");
});

test("un séjour déjà montré avec ses prix les garde", async () => {
  const shown = booking({ visible_to_client: true, prices_visible: true });
  const { client, writes } = fakeSupabase({ booking: { ...shown }, items: cards, documents });
  const result = await openStayForVisa(client, shown);
  assert.equal(result.newlyPublished, false);
  const publish = writes.find((w) => w.table === "crm_bookings" && w.op === "update");
  assert.deepEqual(publish?.payload, { visible_to_client: true, prices_visible: true });
});

test("sans carte, la formalité ne publie pas", async () => {
  const hidden = booking({ visible_to_client: false });
  const { client, writes } = fakeSupabase({ booking: { ...hidden }, items: [{ id: "f", kind: "fee", title: "Frais", details: {} }], documents: [] });
  await assert.rejects(() => openStayForVisa(client, hidden), /au moins une carte/);
  assert.equal(writes.length, 0);
});

test("cacher le carnet masque aussi les prix ; montrer suit l’option", async () => {
  const shown = booking({ visible_to_client: true });
  const hide = fakeSupabase({ booking: { ...shown }, items: cards, documents });
  await setCarnetPublished(hide.client, "b1", false, { prices: true });
  assert.deepEqual(hide.writes[0]?.payload, { visible_to_client: false, prices_visible: false });
  const show = fakeSupabase({ booking: { ...shown }, items: cards, documents });
  await setCarnetPublished(show.client, "b1", true);
  assert.deepEqual(show.writes[0]?.payload, { visible_to_client: true, prices_visible: true });
});
