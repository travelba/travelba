import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingDebitIntent,
  bookingItemDebitExternalId,
  bookingItemDebitLabel,
  bookingTotalFromItems,
  itemSellingAmount,
  parseIncludeInLedger,
} from "./bookings";

test("debit insert only when confirmed with a positive amount", () => {
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 1200, hasOpenDebit: false }),
    "insert"
  );
  assert.equal(
    bookingDebitIntent({ status: "quoted", amount: 1200, hasOpenDebit: false }),
    "noop"
  );
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 0, hasOpenDebit: false }),
    "noop"
  );
});

test("cancel clears charges even without an open debit", () => {
  assert.equal(
    bookingDebitIntent({ status: "cancelled", amount: 1200, hasOpenDebit: true }),
    "clear"
  );
  assert.equal(
    bookingDebitIntent({ status: "cancelled", amount: 0, hasOpenDebit: false }),
    "clear"
  );
});

test("existing debit is voided when the selling price drops to zero", () => {
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 0, hasOpenDebit: true }),
    "void"
  );
  assert.equal(
    bookingDebitIntent({ status: "travelling", amount: 900, hasOpenDebit: true }),
    "update"
  );
});

test("booking debit is skipped when the stay is not included in the ledger", () => {
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 1200,
      hasOpenDebit: false,
      includeInLedger: false,
    }),
    "noop"
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 1200,
      hasOpenDebit: true,
      includeInLedger: false,
    }),
    "void"
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 1200,
      hasOpenDebit: false,
      includeInLedger: true,
    }),
    "insert"
  );
});

test("item debit posts only when flagged on a confirmed stay", () => {
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 800,
      hasOpenDebit: false,
      includeInLedger: true,
    }),
    "insert"
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 800,
      hasOpenDebit: false,
      includeInLedger: false,
    }),
    "noop"
  );
  assert.equal(
    bookingDebitIntent({
      status: "quoted",
      amount: 800,
      hasOpenDebit: false,
      includeInLedger: true,
    }),
    "noop"
  );
  assert.equal(parseIncludeInLedger("on", false), true);
  assert.equal(parseIncludeInLedger(undefined, true), true);
  assert.equal(bookingItemDebitExternalId("b1", "i9"), "booking:b1:item:i9");
  assert.match(bookingItemDebitLabel({ kind: "hotel", title: "Nantipa" }, "TBA-1042"), /Hôtel/);
  assert.match(
    bookingItemDebitLabel(
      { kind: "hotel", title: "Aghouatim", details: { hotel_name: "The Ranch resort" } },
      "TB-2026-0017"
    ),
    /The Ranch resort/
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 273.86,
      hasOpenDebit: true,
      includeInLedger: true,
    }),
    "update"
  );
});

test("stay total is always the sum of card selling prices", () => {
  assert.equal(bookingTotalFromItems([]), 0);
  assert.equal(bookingTotalFromItems([{ amount: null }, { amount: 0 }]), 0);
  assert.equal(bookingTotalFromItems([{ amount: 858 }]), 858);
  assert.equal(
    bookingTotalFromItems([{ amount: 858.8 }, { amount: null }, { amount: 85 }]),
    943.8
  );
  assert.equal(bookingTotalFromItems([{ amount: 10.1 }, { amount: 20.25 }]), 30.35);
  assert.equal(
    itemSellingAmount({ kind: "flight", amount: 250, details: { ticket_count: 5 } }),
    1250
  );
  assert.equal(
    bookingTotalFromItems([
      { kind: "flight", amount: 250, details: { ticket_count: 5 } },
      { kind: "hotel", amount: 800 },
    ]),
    2050
  );
  assert.equal(
    bookingTotalFromItems([
      { kind: "hotel", amount: 800 },
      { kind: "chauffeur", amount: 150 },
      { kind: "greeter", amount: 100 },
    ]),
    800
  );
});
