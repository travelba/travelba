import assert from "node:assert/strict";
import test from "node:test";
import { changePliantCardLimit } from "./pliant-card-run";

const CARD = "8c269177-4030-4477-b759-f2584df6f484";
const OLD = 165_228;
const NEXT = 168_597;

type Row = Record<string, unknown>;

function fakeAdmin(state: { pliant: Row[]; booking: Row[]; bookingError?: { message: string } | null }) {
  const upserts: Row[] = [];
  return {
    upserts,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const api = {
        select() {
          return api;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          if (table === "crm_booking_cards") {
            return Promise.resolve(applyBooking());
          }
          return api;
        },
        maybeSingle: async () => {
          const row = state.pliant.find((item) => item.pliant_card_id === filters.pliant_card_id) || null;
          return { data: row, error: null };
        },
        upsert: async (row: Row) => {
          upserts.push(row);
          const index = state.pliant.findIndex((item) => item.pliant_card_id === row.pliant_card_id);
          if (index >= 0) state.pliant[index] = { ...state.pliant[index], ...row };
          else state.pliant.push(row);
          return { error: null };
        },
        update(patch: Row) {
          return {
            eq(key: string, value: unknown) {
              filters[key] = value;
              return Promise.resolve(apply(patch));
            },
          };
        },
      };
      function apply(patch: Row) {
        if (state.bookingError) return { error: state.bookingError };
        for (const row of state.booking) {
          if (row[Object.keys(filters)[0] || ""] === Object.values(filters)[0]) Object.assign(row, patch);
        }
        return { error: null };
      }
      function applyBooking() {
        return apply({});
      }
      return api;
    },
  };
}

function state(): { pliant: Row[]; booking: Row[]; bookingError?: { message: string } | null } {
  return {
    pliant: [
      {
        pliant_card_id: CARD,
        ceiling_cents: OLD,
        transaction_limit_cents: OLD,
        max_transaction_count: 1,
        currency: "EUR",
        limit_manual: true,
        status: "active",
        label: "Expedia",
        customer_id: "c1",
        booking_id: "b1",
        last4: "4242",
        note: null,
      },
    ],
    booking: [{ pliant_card_id: CARD, limit_cents: OLD, transaction_limit_cents: OLD }],
  };
}

test("monter le plafond aligne le montant par transaction et le dossier", async () => {
  const db = state();
  const admin = fakeAdmin(db);
  const sent: unknown[] = [];
  await changePliantCardLimit(admin, CARD, NEXT, "EUR", {
    setLimit: async (cardId, limit, count, transactionLimit) => {
      sent.push({ cardId, limit, count, transactionLimit });
    },
  });
  assert.deepEqual(sent, [
    {
      cardId: CARD,
      limit: { value: NEXT, currency: "EUR" },
      count: 1,
      transactionLimit: { value: NEXT, currency: "EUR" },
    },
  ]);
  assert.equal(db.booking[0]?.limit_cents, NEXT);
  assert.equal(db.booking[0]?.transaction_limit_cents, NEXT);
  assert.equal(admin.upserts[0]?.ceiling_cents, NEXT);
  assert.equal(admin.upserts[0]?.transaction_limit_cents, NEXT);
  assert.equal(admin.upserts[0]?.max_transaction_count, 1);
  assert.equal(admin.upserts[0]?.limit_manual, true);
});

test("un refus Pliant laisse le dossier à l’ancien plafond", async () => {
  const db = state();
  const admin = fakeAdmin(db);
  await assert.rejects(
    () =>
      changePliantCardLimit(admin, CARD, NEXT, "EUR", {
        setLimit: async () => {
          throw new Error(
            "Pliant n’a pas appliqué le nouveau plafond. Plafond relu : 1 652,28 €. Montant par transaction relu : 1 652,28 €."
          );
        },
      }),
    /n’a pas appliqué/
  );
  assert.equal(db.booking[0]?.limit_cents, OLD);
  assert.equal(db.booking[0]?.transaction_limit_cents, OLD);
  assert.equal(admin.upserts.length, 0);
});

test("Pliant confirmé mais dossier non écrit est une erreur", async () => {
  const db = state();
  db.bookingError = { message: "échec" };
  const admin = fakeAdmin(db);
  await assert.rejects(
    () =>
      changePliantCardLimit(admin, CARD, NEXT, "EUR", {
        setLimit: async () => {},
      }),
    /dossier ne l’a pas enregistré/
  );
});
