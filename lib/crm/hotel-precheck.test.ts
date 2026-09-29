import assert from "node:assert/strict";
import test from "node:test";
import { checkinCardPdf, precheckParty, selectedPrecheckPieces } from "./hotel-precheck";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

function traveler(partial: Partial<CrmBookingTraveler>): CrmBookingTraveler {
  return {
    id: "t1",
    booking_id: "b1",
    companion_id: null,
    is_account_holder: true,
    first_name: "Claire",
    last_name: "Martin",
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
    number: null,
    issuing_country: "FR",
    issued_on: null,
    expires_on: null,
    first_name: "Claire",
    last_name: "Martin",
    birth_date: null,
    nationality: "FR",
    sex: null,
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: "vault/claire.pdf",
    file_name: "claire.pdf",
    mime_type: "application/pdf",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

test("pré-check-in : passeport et carte d'identité des voyageurs, pas le visa", () => {
  const party = precheckParty(
    [traveler({}), traveler({ id: "t2", is_account_holder: false, first_name: "Paul", last_name: "Bernard", companion_id: "c2" })],
    [
      doc({}),
      doc({ id: "id", doc_type: "id_card", storage_path: "vault/claire-id.jpg", file_name: "claire-id.jpg" }),
      doc({ id: "visa", doc_type: "visa", storage_path: "vault/visa.pdf" }),
      doc({
        id: "paul",
        companion_id: "c2",
        first_name: "Paul",
        last_name: "Bernard",
        storage_path: "vault/paul.pdf",
        file_name: "paul.pdf",
      }),
    ]
  );
  assert.deepEqual(
    party.map((row) => ({ name: row.name, pieces: row.pieces.map((piece) => piece.label) })),
    [
      { name: "Claire Martin", pieces: ["Passeport", "Carte d'identité"] },
      { name: "Paul Bernard", pieces: ["Passeport"] },
    ]
  );
  assert.equal(selectedPrecheckPieces(party, ["id"]).length, 1);
});

test("la carte Pliant devient un PDF, pas une ligne du dossier", () => {
  const pdf = checkinCardPdf({
    holder: "Claire Martin",
    pan: "4242424242424242",
    expiry: "06/28",
    cvc: "123",
    lang: "fr",
  });
  const text = pdf.toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /4242 4242 4242 4242/);
  assert.match(text, /Cryptogramme/);
});
