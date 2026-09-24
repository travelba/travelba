import assert from "node:assert/strict";
import test from "node:test";
import { ledgerAfterCharge } from "./visa-ledger";

test("la taxe suit le montant Pliant et les 25 € sautent le refus", () => {
  const lines = ledgerAfterCharge({
    bookingId: "b1",
    country: "IL",
    pliantTransactionId: "tx1",
    paidCents: 744,
    travelerIds: ["a", "c"],
    refusedTravelerIds: ["c"],
  });
  assert.equal(lines[0].label, "Taxe ETA-IL");
  assert.equal(lines[0].amount, 7.44);
  assert.equal(lines[0].externalId, "pliant:tx1");
  assert.equal(lines[1].voided, false);
  assert.equal(lines[1].amount, 25);
  assert.equal(lines[2].voided, true);
  assert.equal(ledgerAfterCharge({
    bookingId: "b1",
    country: "US",
    pliantTransactionId: "",
    paidCents: 100,
    travelerIds: ["a"],
    refusedTravelerIds: [],
  }).length, 0);
});
