import assert from "node:assert/strict";
import test from "node:test";
import {
  attachTravelerToHousehold,
  guestsLabelFromKeys,
  householdMembers,
  linkExtractTravelers,
  travelerNeedsHousehold,
  type LinkedTraveler,
} from "./household";
import { passportVaultRows } from "./passport-vault";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

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

const levyHolder = { first_name: "Nathanaël", last_name: "Martin" };
const levyCompanions = [
  { id: "meryl", first_name: "Méryl", last_name: "Martin" },
  { id: "charles", first_name: "Charles Elie John Haim", last_name: "Martin" },
  { id: "daniel", first_name: "Daniel", last_name: "Martin" },
  { id: "gary", first_name: "Gary", last_name: "Martin" },
  { id: "alma", first_name: "Alma", last_name: "Martin" },
];

test("les prénoms seuls du récap août 2027 remplissent le foyer de ce client", () => {
  const linked = linkExtractTravelers<LinkedTraveler>(
    ["Nathanael", "Meryl", "Charles-Elie", "Daniel", "Gary", "Alma"].map((first_name) => ({
      first_name,
      last_name: null,
    })),
    levyHolder,
    levyCompanions
  );
  assert.deepEqual(linked[0], {
    first_name: "Nathanaël",
    last_name: "Martin",
    companion_id: null,
    is_account_holder: true,
  });
  assert.deepEqual(linked[1], {
    first_name: "Méryl",
    last_name: "Martin",
    companion_id: "meryl",
    is_account_holder: false,
  });
  assert.deepEqual(linked[2], {
    first_name: "Charles Elie John Haim",
    last_name: "Martin",
    companion_id: "charles",
    is_account_holder: false,
  });
  assert.equal(linked[3].companion_id, "daniel");
  assert.equal(linked[4].companion_id, "gary");
  assert.equal(linked[5].first_name, "Alma");
  assert.equal(linked[5].is_account_holder, false);

  const travelers: CrmBookingTraveler[] = linked.map((row, index) => ({
    id: `t${index}`,
    booking_id: "b1",
    companion_id: row.companion_id ?? null,
    is_account_holder: Boolean(row.is_account_holder),
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    created_at: "",
  }));
  const docs: CrmTravelDocument[] = [
    passport("holder-doc", null, "Nathanaël", "Martin"),
    ...levyCompanions.map((companion) =>
      passport(companion.id, companion.id, companion.first_name, companion.last_name)
    ),
  ];
  const rows = passportVaultRows(travelers, docs, "2026-10-19", levyHolder);
  assert.equal(rows.length, 6);
  assert.equal(rows.every((row) => row.label === "Passeport à jour"), true);
});

test("un prénom ambigu ou celui d’un autre client reste libre", () => {
  const ambiguous = attachTravelerToHousehold(
    { first_name: "Daniel", last_name: null },
    levyHolder,
    [
      ...levyCompanions,
      { id: "daniel-autre", first_name: "Daniel", last_name: "Bernard" },
    ]
  );
  assert.equal(ambiguous.companion_id ?? null, null);
  assert.equal(ambiguous.is_account_holder ?? false, false);
  assert.equal(ambiguous.last_name ?? null, null);

  const otherAccount = linkExtractTravelers<LinkedTraveler>(
    [{ first_name: "Gary", last_name: null }],
    { first_name: "Inès", last_name: "Bernard" },
    []
  )[0];
  assert.equal(otherAccount.companion_id ?? null, null);
  assert.equal(otherAccount.is_account_holder ?? false, false);
  assert.equal(otherAccount.first_name, "Gary");

  const onHisAccount = linkExtractTravelers<LinkedTraveler>(
    [{ first_name: "Gary", last_name: null }],
    { first_name: "Inès", last_name: "Bernard" },
    [{ id: "gary-bernard", first_name: "Gary", last_name: "Bernard" }]
  )[0];
  assert.equal(onHisAccount.companion_id, "gary-bernard");
  assert.equal(onHisAccount.last_name, "Bernard");
  assert.notEqual(onHisAccount.companion_id, "gary");
});

function passport(
  id: string,
  companionId: string | null,
  first: string,
  last: string
): CrmTravelDocument {
  return {
    id,
    customer_id: "client-a",
    companion_id: companionId,
    booking_id: null,
    traveler_id: null,
    doc_type: "passport",
    number: null,
    issuing_country: "FR",
    issued_on: null,
    expires_on: "2032-06-01",
    first_name: first,
    last_name: last,
    birth_date: null,
    nationality: "FR",
    sex: null,
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: `vault/${id}`,
    file_name: null,
    mime_type: null,
    created_at: "",
    updated_at: "",
  };
}
