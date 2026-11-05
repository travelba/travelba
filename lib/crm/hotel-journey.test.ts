import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOKING_STEPS,
  discreetSearchPerk,
  hotelJourneySearch,
  hotelJourneyStep,
  payActionLabel,
  rateBoardLine,
  rateChips,
  stayBenefits,
} from "./hotel-journey";
import type { HotelPerks } from "./hotel-search";

const PERKS: HotelPerks = {
  breakfast: true,
  freeCancellation: true,
  upgrade: true,
  credit: true,
  earlyCheckIn: true,
  lateCheckOut: true,
};

const NONE: HotelPerks = {
  breakfast: false,
  freeCancellation: false,
  upgrade: false,
  credit: false,
  earlyCheckIn: false,
  lateCheckOut: false,
};

test("les avantages lus restent les mêmes, dans le même ordre", () => {
  const lines = [
    "Petit-déjeuner quotidien pour deux personnes",
    "Surclassement prioritaire à l'enregistrement",
    "Enregistrement anticipé et départ tardif",
  ];
  const shown = stayBenefits(lines, PERKS);
  assert.deepEqual(shown.lines, lines);
  assert.equal(shown.discreet, "");
  assert.deepEqual(
    rateChips({ breakfast: true, freeCancellation: true, benefits: shown.lines }),
    ["Annulation gratuite"]
  );
  assert.equal(rateBoardLine("Petit-déjeuner inclus", shown.lines), "");
  assert.equal(rateBoardLine("Demi-pension", []), "Demi-pension");
});

test("une ligne anglaise reprend le français du bloc Little Emperors", () => {
  const shown = stayBenefits(
    ["Daily breakfast for two guests", "Priority upgrade at check-in", "Hotel credit per stay"],
    NONE
  );
  assert.deepEqual(shown.lines, [
    "Petit-déjeuner quotidien pour deux personnes",
    "Surclassement prioritaire à l'enregistrement",
    "Crédit hôtel par séjour",
  ]);
  assert.equal(shown.discreet, "");
});

test("sans avantage lu, le seul repli est la pastille de la recherche", () => {
  const shown = stayBenefits(["Surclassement Little Emperors"], { ...NONE, breakfast: true, upgrade: true });
  assert.deepEqual(shown.lines, []);
  assert.equal(shown.discreet, "Petit-déjeuner");
  assert.equal(discreetSearchPerk({ ...NONE, upgrade: true }), "Surclassement");
  assert.deepEqual(rateChips({ breakfast: true, freeCancellation: true, benefits: [] }), [
    "Annulation gratuite",
    "Petit-déjeuner inclus",
  ]);
});

test("le parcours nomme chaque étape, et le paiement distingue l’encaissement", () => {
  assert.deepEqual(
    BOOKING_STEPS.map((step) => step.label),
    ["Chambre", "Voyageurs", "Récapitulatif", "Paiement", "Confirmation"]
  );
  assert.equal(hotelJourneyStep("chambre"), "room");
  assert.equal(hotelJourneyStep("voyageurs"), "guests");
  assert.equal(hotelJourneyStep("recapitulatif"), "recap");
  assert.equal(hotelJourneyStep("paiement"), "pay");
  assert.equal(hotelJourneyStep("confirmation"), "confirm");
  assert.equal(hotelJourneyStep("demande"), "confirm");
  assert.equal(hotelJourneySearch("12", "recap"), "hotel=12&etape=recapitulatif");
  assert.equal(hotelJourneySearch("12", "pay"), "hotel=12&etape=paiement");
  assert.equal(payActionLabel({ method: "card", trial: false }), "Valider et payer");
  assert.equal(payActionLabel({ method: "agency", trial: false }), "Valider la réservation");
  assert.equal(payActionLabel({ method: "card", trial: true }), "Valider la réservation");
});
