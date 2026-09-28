import assert from "node:assert/strict";
import test from "node:test";
import { buildEtaIlDraft, publicEtaIlDraft, tripGoesToIsrael } from "./eta-il-draft";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

function traveler(partial: Partial<CrmBookingTraveler> = {}): CrmBookingTraveler {
  return {
    id: "t1",
    booking_id: "b1",
    companion_id: null,
    is_account_holder: true,
    first_name: "Simon",
    last_name: "Albilia",
    created_at: "",
    ...partial,
  };
}

function passport(partial: Partial<CrmTravelDocument> = {}): CrmTravelDocument {
  return {
    id: "d1",
    customer_id: "c1",
    companion_id: null,
    booking_id: null,
    traveler_id: null,
    doc_type: "passport",
    number: "24HH27003",
    issuing_country: "FR",
    issued_on: null,
    expires_on: "2034-09-26",
    first_name: "Iony",
    last_name: "Albilila",
    birth_date: "1990-01-02",
    nationality: "FR",
    sex: "M",
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

const stay = {
  startDate: "2026-12-14",
  endDate: "2026-12-23",
  agencyEmail: "contact@travelba.fr",
  holder: { first_name: "Simon, Iony", last_name: "Albilila" },
};

test("un vol vers Tel Aviv ouvre l’ETA-IL", () => {
  assert.equal(tripGoesToIsrael([{ kind: "flight", details: { to: "TLV" } }]), true);
  assert.equal(tripGoesToIsrael([{ kind: "flight", details: { to: "JFK" } }]), false);
  assert.equal(tripGoesToIsrael([{ kind: "hotel" }]), false);
});

test("voyageur complet : prêt, le numéro reste hors de la vue publique", () => {
  const draft = buildEtaIlDraft({
    ...stay,
    items: [{ kind: "flight", details: { to: "TLV" } }],
    travelers: [traveler()],
    documents: [passport()],
  });
  assert.equal(draft.phase, "prêt");
  assert.equal(draft.applicants[0]?.number, "24HH27003");
  assert.equal(draft.applicants[0]?.nationality, "FR");
  const pub = JSON.stringify(publicEtaIlDraft(draft));
  assert.equal(pub.includes("24HH27003"), false);
  assert.equal(publicEtaIlDraft(draft).travelers[0]?.ready, true);
});

test("passeport sans numéro : brouillon, le bot ne part pas", () => {
  const draft = buildEtaIlDraft({
    ...stay,
    items: [{ kind: "flight", details: { to: "TLV" } }],
    travelers: [traveler()],
    documents: [passport({ number: null })],
  });
  assert.equal(draft.phase, "brouillon");
  assert.equal(draft.applicants.length, 0);
  assert.equal(draft.travelers[0]?.missing.includes("numéro de passeport"), true);
});

test("sans vol Israël le dossier est bloqué", () => {
  const draft = buildEtaIlDraft({
    ...stay,
    items: [{ kind: "flight", details: { to: "CDG" } }],
    travelers: [traveler()],
    documents: [passport()],
  });
  assert.equal(draft.phase, "bloqué");
  assert.equal(draft.applicants.length, 0);
});

test("un passeport non français bloque la demande", () => {
  const draft = buildEtaIlDraft({
    ...stay,
    items: [{ kind: "flight", details: { to: "TLV" } }],
    travelers: [traveler()],
    documents: [passport({ nationality: "US", issuing_country: "US" })],
  });
  assert.equal(draft.phase, "bloqué");
  assert.equal(draft.applicants.length, 0);
  assert.match(draft.travelers[0]?.blockedReason || "", /français/);
});

test("seuls les voyageurs cochés partent sur le portail", () => {
  const leoh = traveler({ id: "leoh", first_name: "Noa", last_name: "Martin" });
  const ezra = traveler({ id: "ezra", first_name: "Eli", last_name: "Martin" });
  const iony = traveler({ id: "iony", first_name: "Ada", last_name: "Martin" });
  const draft = buildEtaIlDraft({
    ...stay,
    items: [{ kind: "flight", details: { to: "TLV" } }],
    travelers: [iony, leoh, ezra],
    travelerIds: ["leoh", "ezra"],
    documents: [
      passport({ id: "p1", booking_id: "b1", traveler_id: "iony", first_name: "Ada", last_name: "Martin" }),
      passport({ id: "p2", booking_id: "b1", traveler_id: "leoh", number: "24HH27004", first_name: "Noa", last_name: "Martin" }),
      passport({ id: "p3", booking_id: "b1", traveler_id: "ezra", number: "24HH27005", first_name: "Eli", last_name: "Martin" }),
    ],
  });
  assert.equal(draft.phase, "prêt");
  assert.deepEqual(
    draft.applicants.map((row) => row.travelerId),
    ["leoh", "ezra"]
  );
  assert.equal(JSON.stringify(publicEtaIlDraft(draft)).includes("Ada"), false);
});

test("un mineur part avec le représentant adulte, sans numéro dans la vue publique", () => {
  const adult = traveler({ id: "adult", first_name: "Ada", last_name: "Martin", is_account_holder: true });
  const child = traveler({ id: "child", first_name: "Noa", last_name: "Martin", is_account_holder: false });
  const draft = buildEtaIlDraft({
    ...stay,
    items: [{ kind: "flight", details: { to: "TLV" } }],
    travelers: [adult, child],
    travelerIds: ["child"],
    documents: [
      passport({
        id: "pa",
        booking_id: "b1",
        traveler_id: "adult",
        number: "FRADULT01",
        birth_date: "1980-01-02",
        first_name: "Ada",
        last_name: "Martin",
        issuing_country: "FR",
      }),
      passport({
        id: "pc",
        booking_id: "b1",
        traveler_id: "child",
        number: "FRCHILD1",
        birth_date: "2016-04-05",
        first_name: "Noa",
        last_name: "Martin",
        issuing_country: "FR",
      }),
    ],
  });
  assert.equal(draft.phase, "prêt");
  assert.equal(draft.applicants[0]?.minor, true);
  assert.equal(draft.guardian?.firstName, "Ada");
  assert.equal(draft.guardian?.issuingCountry, "FR");
  const pub = JSON.stringify(publicEtaIlDraft(draft));
  assert.equal(pub.includes("FRADULT01"), false);
  assert.equal(pub.includes("FRCHILD1"), false);
});

test("un mineur sans adulte ne part pas", () => {
  const child = traveler({ id: "child", first_name: "Noa", last_name: "Martin", is_account_holder: false });
  const draft = buildEtaIlDraft({
    ...stay,
    items: [{ kind: "flight", details: { to: "TLV" } }],
    travelers: [child],
    documents: [
      passport({
        id: "pc",
        booking_id: "b1",
        traveler_id: "child",
        number: "FRCHILD1",
        birth_date: "2016-04-05",
        first_name: "Noa",
        last_name: "Martin",
      }),
    ],
  });
  assert.equal(draft.phase, "brouillon");
  assert.match(draft.reason || "", /représentant adulte/);
  assert.equal(draft.applicants.length, 0);
});
