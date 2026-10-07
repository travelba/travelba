import assert from "node:assert/strict";
import test from "node:test";
import { isClientPastStay, isClientUpcomingStay } from "./client-stays";

test("un séjour dont le retour est passé est dans Passés", () => {
  const stay = { end_date: "2020-01-01", status: "confirmed" };
  assert.equal(isClientUpcomingStay(stay), false);
  assert.equal(isClientPastStay(stay), true);
});

test("un séjour annulé à venir n’est pas dans À venir", () => {
  const stay = { end_date: "2099-12-31", status: "cancelled" };
  assert.equal(isClientUpcomingStay(stay), false);
  assert.equal(isClientPastStay(stay), true);
});

test("un séjour à venir confirmé n’est pas dans Passés", () => {
  const stay = { end_date: "2099-06-01", status: "confirmed" };
  assert.equal(isClientUpcomingStay(stay), true);
  assert.equal(isClientPastStay(stay), false);
});
