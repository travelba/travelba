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
