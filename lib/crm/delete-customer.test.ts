import assert from "node:assert/strict";
import test from "node:test";
import { customerFilePrefixes, isUuid } from "./ids";

test("only accepts uuid customer ids", () => {
  assert.equal(isUuid("d39602e0-0af3-455e-969d-802bc6eb8996"), true);
  assert.equal(isUuid("D39602E0-0AF3-455E-969D-802BC6EB8996"), true);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid("clients/all"), false);
  assert.equal(isUuid("../etc/passwd"), false);
});

test("file prefixes stay under the customer and its bookings", () => {
  const customerId = "d39602e0-0af3-455e-969d-802bc6eb8996";
  const bookingId = "e29a2074-5f2c-4719-8507-6947366e37ba";
  assert.deepEqual(customerFilePrefixes(customerId, [bookingId]), [
    `customers/${customerId}`,
    `bookings/${bookingId}`,
  ]);
});
