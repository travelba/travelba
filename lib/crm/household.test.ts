import assert from "node:assert/strict";
import test from "node:test";
import {
  attachTravelerToHousehold,
  guestsLabelFromKeys,
  householdMembers,
  linkExtractTravelers,
  travelerNeedsHousehold,
} from "./household";

const holder = { first_name: "Jérémy", last_name: "Martin", birth_date: "1988-01-01" };
const companions = [{ id: "c1", first_name: "Camille", last_name: "Martin", birth_date: "1990-02-02" }];

test("rattache un nom PDF unique au foyer", () => {
  const linked = attachTravelerToHousehold(
    { first_name: "Jeremy", last_name: "Martin" },
    holder,
    companions
  );
  assert.equal(linked.is_account_holder, true);
  const guest = attachTravelerToHousehold(
    { first_name: "Camille Rose", last_name: "Martin" },
    holder,
    companions
  );
  assert.equal(guest.companion_id, "c1");
  const unknown = attachTravelerToHousehold(
    { first_name: "Noah", last_name: "Dupont" },
    holder,
    companions
  );
  assert.equal(travelerNeedsHousehold(unknown), true);
});

test("libellé chambre depuis le foyer", () => {
  const members = householdMembers(holder, companions);
  assert.equal(members.length, 2);
  const labeled = guestsLabelFromKeys(["holder", "companion:c1"], members);
  assert.match(labeled, /Jérémy/);
  assert.match(labeled, /Camille/);
  const batch = linkExtractTravelers(
    [
      { first_name: "Adulte", last_name: "1" },
      { first_name: "Camille", last_name: "Martin" },
    ] as { first_name: string; last_name: string; companion_id?: string | null }[],
    holder,
    companions
  );
  assert.equal(batch[1].companion_id, "c1");
});
