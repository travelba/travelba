import assert from "node:assert/strict";
import test from "node:test";
import { bookingDebitIntent } from "./bookings";

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

test("existing debit is voided on cancel or zero total", () => {
  assert.equal(
    bookingDebitIntent({ status: "cancelled", amount: 1200, hasOpenDebit: true }),
    "void"
  );
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 0, hasOpenDebit: true }),
    "void"
  );
  assert.equal(
    bookingDebitIntent({ status: "travelling", amount: 900, hasOpenDebit: true }),
    "update"
  );
});
