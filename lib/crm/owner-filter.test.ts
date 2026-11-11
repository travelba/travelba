import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingMatchesOwner,
  chargeOptionLabel,
  chargeSelectOptions,
  ownerFilterParam,
  parseOwnerFilter,
  showTakeCharge,
} from "./owner-filter";
import { staffGivenName, staffInitials } from "./staff-name";

const MARIE = "11111111-1111-4111-8111-111111111111";
const CORALIE = "22222222-2222-4222-8222-222222222222";

test("le prénom et les initiales tiennent dans une pastille", () => {
  assert.equal(staffGivenName("Marie Martin"), "Marie");
  assert.equal(staffGivenName("  Coralie  "), "Coralie");
  assert.equal(staffGivenName("Jean-Pierre Dupont"), "Jean-Pierre");
  assert.equal(staffGivenName(""), "");
  assert.equal(staffInitials("Marie Martin"), "MM");
  assert.equal(staffInitials("Raphael"), "R");
  assert.equal(staffInitials("Jean-Pierre Dupont"), "JD");
});

test("le filtre En charge lit moi, personne et un collègue", () => {
  assert.deepEqual(parseOwnerFilter(null), { kind: "all" });
  assert.deepEqual(parseOwnerFilter("ailleurs"), { kind: "all" });
  assert.deepEqual(parseOwnerFilter("moi"), { kind: "mine" });
  assert.deepEqual(parseOwnerFilter("personne"), { kind: "none" });
  assert.deepEqual(parseOwnerFilter(MARIE), { kind: "staff", id: MARIE });
  assert.equal(ownerFilterParam({ kind: "all" }), null);
  assert.equal(ownerFilterParam({ kind: "mine" }), "moi");
  assert.equal(ownerFilterParam({ kind: "none" }), "personne");
  assert.equal(ownerFilterParam({ kind: "staff", id: CORALIE }), CORALIE);
});

test("un dossier sans responsable ne sort que dans Personne", () => {
  assert.equal(bookingMatchesOwner(null, { kind: "all" }, MARIE), true);
  assert.equal(bookingMatchesOwner(null, { kind: "none" }, MARIE), true);
  assert.equal(bookingMatchesOwner(MARIE, { kind: "none" }, MARIE), false);
  assert.equal(bookingMatchesOwner(MARIE, { kind: "mine" }, MARIE), true);
  assert.equal(bookingMatchesOwner(CORALIE, { kind: "mine" }, MARIE), false);
  assert.equal(bookingMatchesOwner(CORALIE, { kind: "staff", id: CORALIE }, MARIE), true);
  assert.equal(bookingMatchesOwner(MARIE, { kind: "staff", id: CORALIE }, MARIE), false);
});

test("le sélecteur nomme Moi, Personne et le prénom, le nom complet s’il y a deux Marie", () => {
  assert.equal(chargeOptionLabel("Marie Martin", ["Marie Martin", "Coralie Bernard"]), "Marie");
  assert.equal(chargeOptionLabel("Marie Martin", ["Marie Martin", "Marie Dupont"]), "Marie Martin");
  const options = chargeSelectOptions([
    { id: MARIE, name: "Marie Martin" },
    { id: CORALIE, name: "Coralie Bernard" },
  ]);
  assert.deepEqual(
    options.map((option) => option.label),
    ["En charge : Tous", "En charge : Moi", "En charge : Personne", "En charge : Marie", "En charge : Coralie"]
  );
  assert.equal(options[3]?.value, MARIE);
});

test("Me mettre en charge s’affiche tant que ce n’est pas déjà soi", () => {
  assert.equal(showTakeCharge({ canTake: true, mine: false }), true);
  assert.equal(showTakeCharge({ canTake: true, mine: true }), false);
  assert.equal(showTakeCharge({ canTake: false, mine: false }), false);
});
