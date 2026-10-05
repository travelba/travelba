import assert from "node:assert/strict";
import test from "node:test";
import { ECB_SNAPSHOT, centsToEur, corridorCeilingCents } from "./visa-fees";
import { ensureIlPliantCard, type VisaCardDb } from "./visa-card";

function memory(card: { pliant_card_id?: string | null; ceiling_cents?: number } | null = null): VisaCardDb & {
  saved: Record<string, unknown> | null;
} {
  const state = { card, saved: null as Record<string, unknown> | null };
  const db = {
    saved: state.saved,
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        in() {
          return api;
        },
        maybeSingle: async () => ({ data: table === "crm_visa_cards" ? state.card : null }),
        upsert: async (row: Record<string, unknown>) => {
          state.saved = row;
          state.card = { pliant_card_id: String(row.pliant_card_id || ""), ceiling_cents: Number(row.ceiling_cents) };
          db.saved = row;
          return { data: row };
        },
        then(resolve: (value: { data: unknown[] }) => unknown) {
          const data = table === "crm_bookings" ? [{ id: "b1" }] : state.card?.pliant_card_id ? [state.card] : [];
          return Promise.resolve({ data }).then(resolve);
        },
      };
      return api;
    },
  };
  return db as unknown as VisaCardDb & { saved: Record<string, unknown> | null };
}

const input = {
  bookingId: "b1",
  customerId: "c1",
  firstName: "Ada",
  lastName: "Martin",
  travelerCount: 2,
  bookingReference: "TB-1",
  rates: ECB_SNAPSHOT.rates,
  organizationId: "org",
  cardholderId: "holder",
};

test("la carte Pliant couvre 25 ILS par voyageur plus 30 %", async () => {
  const db = memory();
  const sent: { limit?: { value?: number; currency?: string }; maxTransactionCount?: number } = {};
  const card = await ensureIlPliantCard({
    ...input,
    db,
    configured: true,
    issue: async (_id, payload) => {
      Object.assign(sent, payload);
      return { cardId: "card-1" };
    },
  });
  const cents = corridorCeilingCents("IL", 2, ECB_SNAPSHOT.rates) || 0;
  assert.equal(card.issued, true);
  assert.equal(card.feeIls, 50);
  assert.equal(card.ceilingEur, centsToEur(cents));
  assert.equal(sent.limit?.value, cents);
  assert.equal(sent.limit?.currency, "EUR");
  assert.equal(sent.maxTransactionCount, 2);
  assert.equal(db.saved?.pliant_card_id, "card-1");
  assert.equal(db.saved?.ceiling_cents, cents);
  assert.equal(JSON.stringify(card).toLowerCase().includes("pan"), false);
});

test("sans Pliant aucune carte n’est émise", async () => {
  let called = false;
  const card = await ensureIlPliantCard({
    ...input,
    db: memory(),
    configured: false,
    issue: async () => {
      called = true;
      return { cardId: "card-1" };
    },
  });
  assert.equal(called, false);
  assert.equal(card.issued, false);
  assert.match(card.journal, /Pliant n’est pas branchée/);
});

test("une carte déjà ouverte n’est pas recréée", async () => {
  let issued = 0;
  let raised = 0;
  const card = await ensureIlPliantCard({
    ...input,
    db: memory({ pliant_card_id: "card-existante" }),
    configured: true,
    issue: async () => {
      issued += 1;
      return { cardId: "card-2" };
    },
    raise: async () => {
      raised += 1;
    },
  });
  assert.equal(issued, 0);
  assert.equal(raised, 1);
  assert.equal(card.cardId, "card-existante");
  assert.equal(card.issued, true);
});
