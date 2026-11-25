import assert from "node:assert/strict";
import test from "node:test";
import { inheritedTicketingFees, ticketingFeeKept } from "./ticketing-review";

test("la liste ne garde que les frais automatiques encore actifs", () => {
  const rows = inheritedTicketingFees([
    { id: "auto", kind: "expense", lifecycle: "active", details: { auto_fee: "ticketing" } },
    { id: "kept", kind: "expense", lifecycle: "active", details: { auto_fee: "ticketing", fee_kept: true } },
    { id: "gone", kind: "expense", lifecycle: "removed", details: { auto_fee: "ticketing" } },
    { id: "hand", kind: "expense", lifecycle: "active", details: { fee_touched: true } },
    { id: "hotel", kind: "hotel", lifecycle: "active", details: { auto_fee: "ticketing" } },
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["auto", "kept"]
  );
  assert.equal(ticketingFeeKept(rows[1].details), true);
  assert.equal(ticketingFeeKept(rows[0].details), false);
});
