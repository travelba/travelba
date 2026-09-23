import assert from "node:assert/strict";
import test from "node:test";
import {
  primaryIdentityDoc,
  reusableDocumentsForTraveler,
  tripDocCoverage,
  tripDocumentsForTraveler,
  vaultDocumentsForPerson,
  vaultDocumentsForTraveler,
} from "./trip-documents";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

function traveler(partial: Partial<CrmBookingTraveler>): CrmBookingTraveler {
  return {
    id: "t1",
    booking_id: "b1",
    companion_id: null,
    is_account_holder: true,
    first_name: "Benjamin",
    last_name: "Boukris",
    created_at: "",
    ...partial,
  };
}

function doc(partial: Partial<CrmTravelDocument>): CrmTravelDocument {
  return {
    id: "d1",
    customer_id: "c1",
    companion_id: null,
    booking_id: null,
    traveler_id: null,
    doc_type: "passport",
    number: "12AB",
    issuing_country: "FR",
    issued_on: null,
    expires_on: "2030-01-01",
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
    ...partial,
  };
}

test("vault vs trip documents stay separate", () => {
  const holder = traveler({});
  const vault = [doc({ id: "vault" })];
  const trip = [doc({ id: "trip", booking_id: "b1", traveler_id: "t1" })];
  assert.equal(vaultDocumentsForTraveler(vault, holder)[0]?.id, "vault");
  assert.equal(vaultDocumentsForPerson(vault, null)[0]?.id, "vault");
  assert.equal(tripDocumentsForTraveler(trip, holder)[0]?.id, "trip");
  assert.equal(tripDocumentsForTraveler(vault, holder).length, 0);
  assert.equal(primaryIdentityDoc(trip)?.id, "trip");
  assert.deepEqual(tripDocCoverage([holder], trip), { ready: 1, total: 1 });
  assert.deepEqual(tripDocCoverage([holder], vault), { ready: 0, total: 1 });
  assert.deepEqual(tripDocCoverage([holder], []), { ready: 0, total: 1 });
});

test("companion docs never attach to the account holder", () => {
  const holder = traveler({});
  const companion = traveler({
    id: "t2",
    companion_id: "comp-1",
    is_account_holder: false,
    first_name: "Léa",
  });
  const docs = [
    doc({ id: "holder-trip", booking_id: "b1", traveler_id: "t1" }),
    doc({ id: "comp-trip", booking_id: "b1", traveler_id: "t2", companion_id: "comp-1" }),
  ];
  assert.equal(tripDocumentsForTraveler(docs, holder)[0]?.id, "holder-trip");
  assert.equal(tripDocumentsForTraveler(docs, companion)[0]?.id, "comp-trip");
  assert.deepEqual(tripDocCoverage([holder, companion], docs), { ready: 2, total: 2 });
});

test("le coffre et la copie d’un séjour précédent ne font qu’une case", () => {
  const holder = traveler({ id: "t-new", booking_id: "b2" });
  const previous = doc({
    id: "maldives",
    booking_id: "b1",
    traveler_id: "t-old",
    number: "22 DC 3713",
    created_at: "2025-01-01",
  });
  const vault = doc({ id: "vault", number: "22DC3713", created_at: "2024-01-01" });
  const reusable = reusableDocumentsForTraveler([previous, vault], holder);
  assert.deepEqual(
    reusable.map((item) => item.id),
    ["vault"]
  );
  assert.equal(tripDocumentsForTraveler([previous], holder).length, 0);
});

test("un séjour précédent sans coffre reste proposable", () => {
  const holder = traveler({ id: "t-new", booking_id: "b2" });
  const previous = doc({
    id: "maldives",
    booking_id: "b1",
    traveler_id: "t-old",
    number: "99ZZ",
  });
  const other = doc({ id: "renewed", number: "11AA", created_at: "2026-01-01" });
  assert.deepEqual(
    reusableDocumentsForTraveler([previous, other], holder).map((item) => item.id),
    ["renewed", "maldives"]
  );
});

test("un voyageur sans lien retrouve le passeport du coffre par le nom", () => {
  const jeremy = traveler({
    is_account_holder: false,
    first_name: "Jeremy",
    last_name: "Martin",
  });
  const camille = traveler({
    id: "t2",
    is_account_holder: false,
    first_name: "Camille",
    last_name: "Beaumont",
  });
  const ghost = traveler({
    id: "t3",
    is_account_holder: false,
    first_name: "Adulte",
    last_name: "2",
  });
  const docs = [
    doc({
      id: "jeremy",
      first_name: "Jérémy Moïse",
      last_name: "Martin",
    }),
    doc({
      id: "camille",
      companion_id: "comp",
      first_name: "Camille Rose",
      last_name: "Bbeaummont",
    }),
  ];
  assert.equal(reusableDocumentsForTraveler(docs, jeremy)[0]?.id, "jeremy");
  assert.equal(reusableDocumentsForTraveler(docs, camille)[0]?.id, "camille");
  assert.equal(reusableDocumentsForTraveler(docs, ghost).length, 0);
  assert.deepEqual(tripDocCoverage([jeremy, camille, ghost], []), { ready: 0, total: 2 });
});
