import assert from "node:assert/strict";
import test from "node:test";
import {
  primaryIdentityDoc,
  reusableDocumentsForTraveler,
  tripDocCoverage,
  tripDocumentsForTraveler,
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
  assert.equal(tripDocumentsForTraveler(trip, holder)[0]?.id, "trip");
  assert.equal(tripDocumentsForTraveler(vault, holder).length, 0);
  assert.equal(primaryIdentityDoc(trip)?.id, "trip");
  assert.deepEqual(tripDocCoverage([holder], trip), { ready: 1, total: 1 });
  assert.deepEqual(tripDocCoverage([holder], vault), { ready: 1, total: 1 });
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

test("a previous trip passport can be reused on the next stay", () => {
  const holder = traveler({ id: "t-new", booking_id: "b2" });
  const previous = doc({
    id: "maldives",
    booking_id: "b1",
    traveler_id: "t-old",
    created_at: "2025-01-01",
  });
  const vault = doc({ id: "vault", created_at: "2024-01-01" });
  const reusable = reusableDocumentsForTraveler([previous, vault], holder);
  assert.equal(reusable[0]?.id, "maldives");
  assert.equal(reusable.map((item) => item.id).includes("vault"), true);
  assert.equal(tripDocumentsForTraveler([previous], holder).length, 0);
});
