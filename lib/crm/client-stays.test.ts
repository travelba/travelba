import assert from "node:assert/strict";
import test from "node:test";
import { isClientPastStay, isClientUpcomingStay } from "./client-stays";

test("un séjour futur marqué terminé n’est que dans Passés", () => {
  const stay = { end_date: "2099-12-31", status: "completed" };
  assert.equal(isClientUpcomingStay(stay), false);
  assert.equal(isClientPastStay(stay), true);
});

test("un séjour à venir confirmé n’est pas dans Passés", () => {
  const stay = { end_date: "2099-06-01", status: "confirmed" };
  assert.equal(isClientUpcomingStay(stay), true);
  assert.equal(isClientPastStay(stay), false);
});
