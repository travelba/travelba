import assert from "node:assert/strict";
import test from "node:test";
import { assignVisaHolders, holdersFromVisaText } from "./visa-assign";
import type { CrmBookingTraveler } from "./types";

const countries = [
  { iso: "US", name: "États-Unis" },
  { iso: "IN", name: "Inde" },
];

function traveler(id: string, first: string, last: string): CrmBookingTraveler {
  return {
    id,
    booking_id: "b1",
    companion_id: null,
    is_account_holder: false,
    first_name: first,
    last_name: last,
    created_at: "",
  };
}

const marie = traveler("t1", "Marie", "Dupont");
const paul = traveler("t2", "Paul", "Martin");

test("a text visa names each traveler when one country is readable", () => {
  const holders = holdersFromVisaText(
    "ESTA approval MARIE DUPONT and PAUL MARTIN United States",
    [marie, paul],
    countries
  );
  assert.equal(holders.length, 2);
  const result = assignVisaHolders(holders, [marie, paul], countries);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    result.assigned.map((row) => row.travelerId),
    ["t1", "t2"]
  );
  assert.equal(result.assigned[0]?.country, "US");
  assert.equal(result.assigned[1]?.country, "US");
});

test("unique name and matching country validate, expiry does not block", () => {
  const result = assignVisaHolders(
    [
      {
        first_name: "Marie",
        last_name: "Dupont",
        country: "Inde",
        expires_on: "2020-01-01",
      },
    ],
    [marie, paul],
    countries
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.assigned[0]?.travelerId, "t1");
  assert.equal(result.assigned[0]?.country, "IN");
  assert.equal(result.assigned[0]?.expires_on, "2020-01-01");
});

test("an unreadable or shared name is rejected and not assigned", () => {
  const unread = assignVisaHolders([], [marie], countries);
  assert.equal(unread.assigned.length, 0);
  assert.match(unread.errors[0] || "", /nom/);
  const shared = assignVisaHolders(
    [{ first_name: "Marie", last_name: "Dupont", country: "US" }],
    [marie, traveler("t3", "Marie", "Dupont")],
    countries
  );
  assert.equal(shared.assigned.length, 0);
  assert.match(shared.errors[0] || "", /seul voyageur/);
});

test("a visa for another country is not validated", () => {
  const result = assignVisaHolders(
    [{ first_name: "Marie", last_name: "Dupont", country: "JP" }],
    [marie],
    countries
  );
  assert.equal(result.assigned.length, 0);
  assert.match(result.errors[0] || "", /pays du séjour/);
});

test("Adulte 1 is not a person and two visas for one traveler both stay", () => {
  const adult = traveler("t9", "Adulte", "1");
  const holders = holdersFromVisaText("ESTA Adulte 1", [adult, marie], countries);
  assert.equal(holders.length, 0);
  const first = assignVisaHolders(
    [{ first_name: "Marie", last_name: "Dupont", country: "US", number: "A" }],
    [marie],
    countries
  );
  const second = assignVisaHolders(
    [{ first_name: "Marie", last_name: "Dupont", country: "US", number: "B" }],
    [marie],
    countries
  );
  assert.equal(first.assigned[0]?.number, "A");
  assert.equal(second.assigned[0]?.number, "B");
  assert.notEqual(first.assigned[0]?.number, second.assigned[0]?.number);
});
