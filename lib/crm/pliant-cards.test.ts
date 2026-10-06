import assert from "node:assert/strict";
import test from "node:test";
import { mergePliantCard, type PliantCardDraft } from "./pliant-cards";

const existing: PliantCardDraft = {
  pliant_card_id: "card-1",
  customer_id: "c1",
  booking_id: "b1",
  label: "Ada Martin",
  last4: "4242",
  limit_cents: 13000,
  currency: "EUR",
  status: "active",
  limit_manual: true,
  transaction_limit_cents: 4000,
  max_transaction_count: 3,
};

test("un plafond saisi n’est pas réécrit par la synchro", () => {
  const next = mergePliantCard(existing, {
    pliant_card_id: "card-1",
    limit_cents: 20000,
    booking_id: "b1",
  });
  assert.equal(next.limit_cents, 13000);
  assert.equal(next.limit_manual, true);
  assert.equal(next.booking_id, "b1");
  assert.equal(next.max_transaction_count, 3);
  assert.equal(next.transaction_limit_cents, 4000);
});

test("modifier le plafond remplace le montant et le garde manuel", () => {
  const next = mergePliantCard(existing, {
    pliant_card_id: "card-1",
    limit_cents: 18000,
    limit_manual: true,
  });
  assert.equal(next.limit_cents, 18000);
  assert.equal(next.limit_manual, true);
  assert.equal(next.customer_id, "c1");
});

test("une carte client n’a pas de dossier", () => {
  const next = mergePliantCard(null, {
    pliant_card_id: "card-2",
    customer_id: "c1",
    booking_id: null,
    limit_cents: 5000,
    limit_manual: true,
    status: "active",
  });
  assert.equal(next.booking_id, null);
  assert.equal(next.customer_id, "c1");
  assert.equal(next.limit_cents, 5000);
});

test("bloquer ne change pas le plafond", () => {
  const next = mergePliantCard(existing, { pliant_card_id: "card-1", status: "locked" });
  assert.equal(next.status, "locked");
  assert.equal(next.limit_cents, 13000);
});
