import assert from "node:assert/strict";
import test from "node:test";
import { customerPathScope, isSafeCrmPath } from "./files-access";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";

test("rejects traversal, absolute and malformed paths", () => {
  assert.equal(isSafeCrmPath(""), false);
  assert.equal(isSafeCrmPath("/customers/x"), false);
  assert.equal(isSafeCrmPath("customers/../bookings/x"), false);
  assert.equal(isSafeCrmPath("customers//x.pdf"), false);
  assert.equal(isSafeCrmPath("customers\\x.pdf"), false);
  assert.equal(isSafeCrmPath(`customers/${ME}/passport.jpg`), true);
});

test("customer may only read own vault files", () => {
  assert.deepEqual(customerPathScope(`customers/${ME}/passport.jpg`, ME), { kind: "own" });
  assert.deepEqual(customerPathScope(`customers/${OTHER}/passport.jpg`, ME), { kind: "denied" });
  assert.deepEqual(customerPathScope(`customers/${ME}x/passport.jpg`, ME), { kind: "denied" });
});

test("booking files require a real booking id and a second check", () => {
  assert.deepEqual(customerPathScope(`bookings/${BOOKING}/cover.webp`, ME), {
    kind: "booking",
    bookingId: BOOKING,
  });
  assert.deepEqual(customerPathScope("bookings/not-a-uuid/x.pdf", ME), { kind: "denied" });
  assert.deepEqual(customerPathScope("bookings/", ME), { kind: "denied" });
});

test("staging and unknown prefixes are denied to customers", () => {
  assert.deepEqual(customerPathScope(`ingest-tmp/${ME}/batch/x.pdf`, ME), { kind: "denied" });
  assert.deepEqual(customerPathScope("revolut/export.csv", ME), { kind: "denied" });
});
