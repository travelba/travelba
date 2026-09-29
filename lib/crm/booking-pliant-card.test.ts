import assert from "node:assert/strict";
import test from "node:test";
import { ensureBookingPliantCard, type BookingPliantDb } from "./booking-pliant-card";

function memory(card: { pliant_card_id?: string | null; card_last4?: string | null } | null = null) {
  const state = { card, saved: null as Record<string, unknown> | null };
  const db: BookingPliantDb & { saved: Record<string, unknown> | null } = {
    saved: null,
    from() {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        maybeSingle: async () => ({ data: state.card }),
        upsert: async (row: Record<string, unknown>) => {
          state.saved = row;
          state.card = {
            pliant_card_id: String(row.pliant_card_id || ""),
            card_last4: (row.card_last4 as string | null) || null,
          };
          db.saved = row;
          return { data: row };
        },
      };
      return api;
    },
  };
  return { db, state };
}

const common = {
  bookingId: "b1",
  firstName: "Camille",
  lastName: "Martin",
  bookingReference: "TB-1042",
  endDate: "2026-11-08",
  ceilingCents: 80_000,
  today: "2026-09-29",
  configured: true,
  organizationId: "org",
  cardholderId: "holder",
};

test("la première génération émet la carte au nom du client", async () => {
  const { db } = memory();
  let issued = 0;
  const result = await ensureBookingPliantCard({
    ...common,
    db,
    issue: async (_holder, body) => {
      issued += 1;
      const card = body as { customFirstName?: string; customLastName?: string; limit?: { value?: number } };
      assert.equal(card.customFirstName, "Camille");
      assert.equal(card.customLastName, "Martin");
      assert.equal(card.limit?.value, 80_000);
      return { cardId: "card-1" };
    },
    updateLimit: async () => {
      throw new Error("pas de mise à jour");
    },
    readLast4: async () => "4242",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.issued, true);
    assert.equal(result.last4, "4242");
    assert.equal(result.holderFirstName, "Camille");
  }
  assert.equal(issued, 1);
  assert.equal(db.saved?.pliant_card_id, "card-1");
});

test("un second clic change le plafond sans réémettre", async () => {
  const { db } = memory({ pliant_card_id: "card-1", card_last4: "4242" });
  let issued = 0;
  let next = 0;
  const result = await ensureBookingPliantCard({
    ...common,
    ceilingCents: 120_000,
    db,
    issue: async () => {
      issued += 1;
      return { cardId: "card-2" };
    },
    updateLimit: async (cardId, limit) => {
      next += 1;
      assert.equal(cardId, "card-1");
      assert.equal(limit.value, 120_000);
    },
  });
  assert.equal(issued, 0);
  assert.equal(next, 1);
  assert.equal(result.ok && result.issued, false);
  assert.equal(db.saved?.ceiling_cents, 120_000);
});

test("sans Pliant, rien n’est émis", async () => {
  const { db } = memory();
  const result = await ensureBookingPliantCard({
    ...common,
    configured: false,
    db,
    issue: async () => ({ cardId: "card-1" }),
    updateLimit: async () => undefined,
  });
  assert.deepEqual(result, { ok: false, error: "Pliant n’est pas branché." });
  assert.equal(db.saved, null);
});
