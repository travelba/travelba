import assert from "node:assert/strict";
import test from "node:test";
import { passportVaultRows } from "./passport-vault";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

function traveler(partial: Partial<CrmBookingTraveler>): CrmBookingTraveler {
  return {
    id: "t1",
    booking_id: "b1",
    companion_id: null,
    is_account_holder: true,
    first_name: "Camille",
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
    number: "SECRET",
    issuing_country: "FR",
    issued_on: null,
    expires_on: "2030-01-01",
    first_name: "Camille",
    last_name: "Martin",
    birth_date: null,
    nationality: null,
    sex: null,
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: null,
    file_name: null,
    mime_type: null,
    created_at: "2026-01-01",
    updated_at: "",
    ...partial,
  };
}

test("coffre : à jour, bientôt, manquant, sans numéro", () => {
  const rows = passportVaultRows(
    [
      traveler({ id: "ok" }),
      traveler({ id: "soon", first_name: "Léa", last_name: "Martin", is_account_holder: false }),
      traveler({ id: "gap", first_name: "Noé", last_name: "Martin", is_account_holder: false }),
      traveler({ id: "blank", first_name: "Adulte", last_name: "1", is_account_holder: false }),
    ],
    [
      doc({ first_name: "Camille", last_name: "Martin", expires_on: "2030-01-01" }),
      doc({
        id: "d2",
        first_name: "Léa",
        last_name: "Martin",
        expires_on: "2026-10-01",
      }),
    ],
    "2026-09-01"
  );
  assert.deepEqual(
    rows.map((row) => `${row.name}:${row.label}`),
    ["Camille Martin:Passeport à jour", "Léa Martin:Expire bientôt", "Noé Martin:Passeport manquant"]
  );
  assert.equal(JSON.stringify(rows).includes("SECRET"), false);
});
