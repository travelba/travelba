import assert from "node:assert/strict";
import test from "node:test";
import { guestNameOk } from "./hotel-journey";
import { composeRoomGuests, knownTravelerNames, roomOccupancyLabel, travelerDisplayName } from "./hotel-party";

test("l’occupation nomme l’âge de l’enfant", () => {
  assert.equal(roomOccupancyLabel({ adults: 2, children: [{ age: 5 }] }), "2 adultes, 1 enfant de 5 ans");
  assert.equal(roomOccupancyLabel({ adults: 1, children: [] }), "1 adulte");
  assert.equal(roomOccupancyLabel({ adults: 2, children: [{ age: 5 }, { age: 8 }] }), "2 adultes, 2 enfants de 5 et 8 ans");
  assert.equal(roomOccupancyLabel({ adults: 1, children: [{ age: 0 }] }), "1 adulte, 1 enfant de moins d’un an");
});

test("les voyageurs connus excluent le client", () => {
  assert.equal(travelerDisplayName({ first_name: "Benjamin André", last_name: "Martin", usage_name: "Martin" }), "Benjamin Martin");
  assert.deepEqual(
    knownTravelerNames("Benjamin Martin", [
      { first_name: "Benjamin", last_name: "Martin" },
      { first_name: "Camille", last_name: "Martin" },
      { first_name: "Camille", last_name: "Martin" },
      { first_name: "Léa", last_name: "Martin", usage_name: "Dupont" },
      { first_name: "Jo", last_name: "A" },
    ]),
    ["Camille Martin", "Léa Dupont"]
  );
  const line = composeRoomGuests("Benjamin Martin", ["", "Camille Martin"]);
  assert.equal(line, "Benjamin Martin, Camille Martin");
  assert.equal(guestNameOk(line), true);
});
