import assert from "node:assert/strict";
import test from "node:test";
import { planPartyLinks, planPassportAttach } from "./party-plan";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

function traveler(partial: Partial<CrmBookingTraveler>): CrmBookingTraveler {
  return {
    id: "t1",
    booking_id: "b1",
    companion_id: null,
    is_account_holder: false,
    first_name: "Jeremy",
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
    expires_on: "2030-01-01",
    first_name: "Jérémy Moïse",
    last_name: "Martin",
    birth_date: null,
    nationality: null,
    sex: null,
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: "vault/a",
    file_name: null,
    mime_type: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

const holder = { first_name: "Jérémy Moïse", last_name: "Martin" };
const companion = { id: "comp", first_name: "Camille Rose", last_name: "Bbeaummont" };

test("les voyageurs nommés sont liés et le placeholder est retiré", () => {
  const plans = planPartyLinks(
    [
      traveler({ id: "holder", first_name: "Jeremy", last_name: "Martin" }),
      traveler({ id: "guest", first_name: "Camille", last_name: "Beaumont" }),
      traveler({ id: "ghost", first_name: "Adulte", last_name: "2" }),
    ],
    holder,
    [companion]
  );
  assert.deepEqual(
    plans.find((plan) => plan.id === "holder"),
    { id: "holder", action: "link", is_account_holder: true, companion_id: null }
  );
  assert.deepEqual(
    plans.find((plan) => plan.id === "guest"),
    { id: "guest", action: "link", is_account_holder: false, companion_id: "comp" }
  );
  assert.deepEqual(
    plans.find((plan) => plan.id === "ghost"),
    { id: "ghost", action: "delete" }
  );
});

test("sans nom réel, Adulte 1 et 2 restent", () => {
  const plans = planPartyLinks(
    [
      traveler({ id: "a1", first_name: "Adulte", last_name: "1" }),
      traveler({ id: "a2", first_name: "Adulte", last_name: "2" }),
    ],
    holder,
    []
  );
  assert.equal(plans.every((plan) => plan.action === "keep"), true);
});

test("un passeport de coffre unique et valide est coché, pas un doublon ni un expiré", () => {
  const jeremy = traveler({ id: "holder" });
  const vault = doc({ id: "vault" });
  assert.equal(planPassportAttach(jeremy, [vault], "2026-10-11")?.id, "vault");
  assert.equal(
    planPassportAttach(jeremy, [vault, doc({ id: "other", storage_path: "vault/b" })], "2026-10-11"),
    null
  );
  assert.equal(
    planPassportAttach(
      jeremy,
      [
        vault,
        doc({
          id: "clone",
          booking_id: "other-stay",
          traveler_id: "old",
          storage_path: "vault/a",
        }),
      ],
      "2026-10-11"
    )?.id,
    "vault"
  );
  assert.equal(
    planPassportAttach(jeremy, [doc({ id: "old", expires_on: "2026-10-10" })], "2026-10-11"),
    null
  );
  const checked = doc({
    id: "trip",
    booking_id: "b1",
    traveler_id: "holder",
    storage_path: "vault/a",
  });
  assert.equal(planPassportAttach(jeremy, [vault, checked], "2026-10-11"), null);
});

test("le passeport du compagnon ne se coche pas sur le titulaire", () => {
  const guest = traveler({
    id: "guest",
    first_name: "Camille",
    last_name: "Beaumont",
    companion_id: "comp",
  });
  const holderDoc = doc({ id: "holder-doc" });
  const guestDoc = doc({
    id: "guest-doc",
    companion_id: "comp",
    first_name: "Camille Rose",
    last_name: "Bbeaummont",
    storage_path: "vault/c",
  });
  assert.equal(planPassportAttach(guest, [holderDoc, guestDoc], "2026-10-11")?.id, "guest-doc");
  assert.equal(
    planPassportAttach(traveler({ id: "holder", is_account_holder: true }), [holderDoc, guestDoc], "2026-10-11")
      ?.id,
    "holder-doc"
  );
});

test("le passeport du profil est coché quand le billet n’a qu’un des prénoms", () => {
  const simon = traveler({
    id: "simon",
    first_name: "Simon",
    last_name: "Albilia",
    is_account_holder: true,
  });
  const profile = { first_name: "Simon, Iony", last_name: "Albilila" };
  const passport = doc({
    id: "iony",
    first_name: "Iony",
    last_name: "Albilila",
    expires_on: "2030-01-01",
  });
  const other = doc({
    id: "lisa",
    companion_id: "lisa",
    first_name: "Lisa Sabine",
    last_name: "Garnek",
    storage_path: "vault/lisa",
    number: "99ZZ",
  });
  assert.equal(planPassportAttach(simon, [passport, other], "2026-12-23"), null);
  assert.equal(planPassportAttach(simon, [passport, other], "2026-12-23", profile)?.id, "iony");
});
