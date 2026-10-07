import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { customerDeleteConfirmed, DELETE_CUSTOMER_CONFIRM_ERROR } from "./delete-confirm";
import { deleteCustomerById } from "./delete-customer";
import { bookingFilePrefixes, customerFilePrefixes, isUuid } from "./ids";

type Write = { table: string; op: string; payload: unknown; filters: { method: string; args: unknown[] }[] };

/** Faux client PostgREST : lectures servies par table, écritures journalisées dans l’ordre, échec simulable. */
function fakeAdmin(rows: Record<string, Record<string, unknown>[]>, failOn?: { table: string; op: string }) {
  const writes: Write[] = [];
  function from(table: string) {
    const calls: { method: string; args: unknown[] }[] = [];
    const proxy: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const first = calls[0];
            let result: { data: unknown; error: { message: string } | null } = { data: null, error: null };
            if (first && (first.method === "update" || first.method === "insert" || first.method === "delete")) {
              writes.push({ table, op: first.method, payload: first.args[0], filters: calls.slice(1) });
              if (failOn && failOn.table === table && failOn.op === first.method) {
                result = { data: null, error: { message: `${table} ${first.method} refusé` } };
              }
            } else if (first?.method === "select") {
              const single = calls.some((c) => c.method === "maybeSingle" || c.method === "single");
              const list = rows[table] || [];
              result = { data: single ? (list[0] ?? null) : list, error: null };
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
  return { admin: { from } as unknown as SupabaseClient, writes };
}

const CUSTOMER_ID = "d39602e0-0af3-455e-969d-802bc6eb8996";
const BOOKING_ID = "e29a2074-5f2c-4719-8507-6947366e37ba";
const ROWS = {
  crm_customers: [{ id: CUSTOMER_ID, first_name: "Alice", last_name: "Martin", email: null, auth_user_id: null }],
  crm_bookings: [{ id: BOOKING_ID, cover_image_path: `bookings/${BOOKING_ID}/cover.webp` }],
  crm_travel_documents: [{ storage_path: `customers/${CUSTOMER_ID}/documents/p.pdf` }],
  crm_booking_documents: [{ storage_path: `bookings/${BOOKING_ID}/confirmation.pdf` }],
};

test("only accepts uuid customer ids", () => {
  assert.equal(isUuid("d39602e0-0af3-455e-969d-802bc6eb8996"), true);
  assert.equal(isUuid("D39602E0-0AF3-455E-969D-802BC6EB8996"), true);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid("clients/all"), false);
  assert.equal(isUuid("../etc/passwd"), false);
});

test("file prefixes stay under the customer and its bookings, agency-cards included", () => {
  const customerId = "d39602e0-0af3-455e-969d-802bc6eb8996";
  const bookingId = "e29a2074-5f2c-4719-8507-6947366e37ba";
  assert.deepEqual(customerFilePrefixes(customerId, [bookingId]), [
    `customers/${customerId}`,
    `bookings/${bookingId}`,
    `agency-cards/${bookingId}`,
  ]);
  assert.deepEqual(bookingFilePrefixes(bookingId), [`bookings/${bookingId}`, `agency-cards/${bookingId}`]);
  assert.deepEqual(customerFilePrefixes(customerId, []), [`customers/${customerId}`]);
});

test("la suppression exige le nom complet, casse, espaces et accents indifférents", () => {
  assert.equal(customerDeleteConfirmed("Jérémy Moïse", "Jérémy Moïse"), true);
  assert.equal(customerDeleteConfirmed("  jeremy   moise ", "Jérémy Moïse"), true);
  assert.equal(customerDeleteConfirmed("JEREMY MOISE", "Jérémy Moïse"), true);
  assert.equal(customerDeleteConfirmed("Jérémy", "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed("Jérémy Moïse Dupont", "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed("", "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed(undefined, "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed(null, "Jérémy Moïse"), false);
  assert.equal(customerDeleteConfirmed("", ""), false);
  assert.equal(customerDeleteConfirmed("Client", "Client"), true);
  assert.equal(DELETE_CUSTOMER_CONFIRM_ERROR, "Saisissez le nom du client pour confirmer");
});

test("les mouvements Revolut, Stripe et Pliant reviennent à l’inbox avant toute suppression, puis les fichiers partent", async () => {
  const { admin, writes } = fakeAdmin(ROWS);
  const removed: string[][] = [];
  const listed: string[] = [];
  const result = await deleteCustomerById(CUSTOMER_ID, {
    admin,
    listFiles: async (prefix) => {
      listed.push(prefix);
      return prefix.startsWith("agency-cards/") ? [`${prefix}/item/carte.jpg`] : [];
    },
    removeFiles: async (paths) => {
      removed.push(paths);
    },
  });
  assert.deepEqual(result, { ok: true, name: "Alice Martin" });
  assert.deepEqual(
    writes.map((w) => `${w.table}:${w.op}`),
    [
      "crm_revolut_transactions:update",
      "crm_stripe_transactions:update",
      "crm_pliant_transactions:update",
      "crm_bookings:delete",
      "crm_transactions:delete",
      "crm_customers:delete",
    ]
  );
  assert.deepEqual(writes[0].payload, { status: "unmatched", matched_customer_id: null, matched_transaction_id: null });
  assert.deepEqual(writes[0].filters, [{ method: "eq", args: ["matched_customer_id", CUSTOMER_ID] }]);
  assert.deepEqual(writes[1].payload, { status: "unmatched", matched_customer_id: null, matched_transaction_id: null });
  assert.deepEqual(writes[1].filters, [{ method: "eq", args: ["matched_customer_id", CUSTOMER_ID] }]);
  assert.deepEqual(writes[2].payload, {
    match_status: "unmatched",
    matched_customer_id: null,
    matched_transaction_id: null,
    customer_id: null,
  });
  assert.deepEqual(writes[2].filters, [{ method: "eq", args: ["matched_customer_id", CUSTOMER_ID] }]);
  assert.deepEqual(listed, [`customers/${CUSTOMER_ID}`, `bookings/${BOOKING_ID}`, `agency-cards/${BOOKING_ID}`]);
  assert.deepEqual(removed, [
    [
      `customers/${CUSTOMER_ID}/documents/p.pdf`,
      `bookings/${BOOKING_ID}/confirmation.pdf`,
      `bookings/${BOOKING_ID}/cover.webp`,
      `agency-cards/${BOOKING_ID}/item/carte.jpg`,
    ],
  ]);
});

test("si la remise à l’inbox échoue, rien n’est supprimé", async () => {
  const { admin, writes } = fakeAdmin(ROWS, { table: "crm_revolut_transactions", op: "update" });
  const removed: string[][] = [];
  await assert.rejects(
    () =>
      deleteCustomerById(CUSTOMER_ID, {
        admin,
        listFiles: async () => [],
        removeFiles: async (paths) => {
          removed.push(paths);
        },
      }),
    /crm_revolut_transactions update refusé/
  );
  assert.deepEqual(
    writes.map((w) => `${w.table}:${w.op}`),
    ["crm_revolut_transactions:update"]
  );
  assert.equal(writes.some((w) => w.op === "delete"), false);
  assert.deepEqual(removed, []);
});

test("un identifiant qui n’est pas un uuid est refusé avant toute lecture", async () => {
  await assert.rejects(() => deleteCustomerById("clients/all"), /Identifiant invalide/);
});
