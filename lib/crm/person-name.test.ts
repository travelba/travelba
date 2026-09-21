import assert from "node:assert/strict";
import test from "node:test";
import { companionNamesMatch, holderNamesMatch, proposedTravelerLink } from "./person-name";
import { reusableDocumentsForTraveler } from "./trip-documents";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

test("Benjamin on a ticket matches the fiche Benjamin, Elie, David", () => {
  assert.equal(
    holderNamesMatch(
      { first_name: "Benjamin, Elie, David", last_name: "Martin" },
      { first_name: "Benjamin", last_name: "Martin" }
    ),
    true
  );
});

test("a different given name in the same family is not the holder", () => {
  assert.equal(
    holderNamesMatch(
      { first_name: "Benjamin, Elie, David", last_name: "Martin" },
      { first_name: "Victoria", last_name: "Martin" }
    ),
    false
  );
});

test("companion match accepts a shorter given name, not a different one", () => {
  assert.equal(
    companionNamesMatch(
      { first_name: "Victoria Marie", last_name: "Martin" },
      { first_name: "Victoria", last_name: "Martin" }
    ),
    true
  );
  assert.equal(
    companionNamesMatch(
      { first_name: "Martin Eden Beatrice", last_name: "Martin Eden Beatrice" },
      { first_name: "Victoria", last_name: "Martin" }
    ),
    false
  );
});

test("an unlinked ticket traveler becomes the holder and sees the vault passport", () => {
  const traveler: CrmBookingTraveler = {
    id: "t-benjamin",
    booking_id: "b1",
    companion_id: null,
    is_account_holder: false,
    first_name: "Benjamin",
    last_name: "Martin",
    created_at: "",
  };
  const patch = proposedTravelerLink(
    traveler,
    { first_name: "Benjamin, Elie, David", last_name: "Martin" },
    [
      {
        id: "comp-other",
        first_name: "Martin Eden Beatrice",
        last_name: "Martin Eden Beatrice",
      },
    ]
  );
  assert.deepEqual(patch, { is_account_holder: true });
  const vault: CrmTravelDocument = {
    id: "vault",
    customer_id: "c1",
    companion_id: null,
    booking_id: null,
    traveler_id: null,
    doc_type: "passport",
    number: null,
    issuing_country: "FR",
    issued_on: null,
    expires_on: null,
    first_name: null,
    last_name: null,
    birth_date: null,
    nationality: null,
    sex: null,
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: null,
    file_name: null,
    mime_type: null,
    created_at: "",
    updated_at: "",
  };
  assert.equal(reusableDocumentsForTraveler([vault], traveler).length, 0);
  assert.equal(
    reusableDocumentsForTraveler([vault], { ...traveler, ...patch }).length,
    1
  );
});
