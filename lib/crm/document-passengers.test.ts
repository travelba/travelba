import assert from "node:assert/strict";
import test from "node:test";
import { peopleNotOnStay, passengersFromDetails, uniquePeople } from "./document-passengers";

test("les passagers du document s’ajoutent s’ils ne sont pas déjà sur le séjour", () => {
  const details = {
    passengers: [
      { first_name: "Paul", last_name: "Martin" },
      { first_name: "PAUL", last_name: "MARTIN" },
      { first_name: "Anne", last_name: "Martin" },
      { first_name: "Adulte", last_name: "1" },
    ],
  };
  assert.deepEqual(uniquePeople(passengersFromDetails(details)).map((row) => row.first_name), [
    "Paul",
    "Anne",
  ]);
  const missing = peopleNotOnStay(passengersFromDetails(details), [
    { first_name: "Paul", last_name: "Martin" },
  ]);
  assert.deepEqual(
    missing.map((row) => row.first_name),
    ["Anne"]
  );
  assert.equal(peopleNotOnStay(passengersFromDetails(details), passengersFromDetails(details)).length, 0);
  const loose = peopleNotOnStay(
    [{ first_name: "Lea", last_name: undefined }, { first_name: null, last_name: null }],
    [{ first_name: "Paul", last_name: "Martin" }]
  );
  assert.deepEqual(loose, [{ first_name: "Lea", last_name: null }]);
});
