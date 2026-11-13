import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOKING_STEPS,
  agencyPayOffered,
  discreetSearchPerk,
  initialRate,
  hotelJourneySearch,
  hotelJourneyStep,
  offeredPayMethods,
  payActionLabel,
  presentRates,
  payStepAction,
  rateBoardLine,
  rateCancelBadge,
  rateChips,
  stayBenefits,
} from "./hotel-journey";
import type { ClientRate } from "./hotel-journey";
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

test("le règlement ne propose que les modes permis, sans choix par défaut", () => {
  assert.deepEqual(offeredPayMethods({ api: true, currency: "EUR" }), ["card", "agency"]);
  assert.deepEqual(offeredPayMethods({ api: true, currency: "eur" }), ["card", "agency"]);
  assert.deepEqual(offeredPayMethods({ api: true, currency: "USD" }), ["card"]);
  assert.deepEqual(offeredPayMethods({ api: false, currency: "USD" }), ["card", "agency"]);
  assert.equal(agencyPayOffered({ api: true, currency: "" }), false);
  assert.equal(agencyPayOffered({ api: false, currency: "" }), true);
});

test("le bouton attend un mode, puis la carte, et ne dit Réessayer qu’après l’échec", () => {
  const base = {
    trial: false,
    failed: false,
    sending: false,
    cardOpen: false,
    cardComplete: false,
    offerReady: true,
  };
  assert.deepEqual(payStepAction({ ...base, method: "" }), { label: "Valider", disabled: true });
  assert.deepEqual(payStepAction({ ...base, method: "card" }), { label: "Valider et payer", disabled: false });
  assert.deepEqual(payStepAction({ ...base, method: "agency" }), { label: "Valider la réservation", disabled: false });
  assert.deepEqual(payStepAction({ ...base, method: "card", trial: true }), { label: "Valider la réservation", disabled: false });
  assert.deepEqual(payStepAction({ ...base, method: "", trial: true }), { label: "Valider la réservation", disabled: true });
  assert.deepEqual(
    payStepAction({ ...base, method: "card", cardOpen: true, cardComplete: false }),
    { label: "Valider et payer", disabled: true }
  );
  assert.deepEqual(
    payStepAction({ ...base, method: "card", cardOpen: true, cardComplete: true }),
    { label: "Valider et payer", disabled: false }
  );
  assert.deepEqual(payStepAction({ ...base, method: "agency", cardOpen: true, cardComplete: false }), {
    label: "Valider la réservation",
    disabled: false,
  });
  assert.deepEqual(payStepAction({ ...base, method: "agency", failed: true }), { label: "Réessayer", disabled: false });
  assert.deepEqual(payStepAction({ ...base, method: "card", failed: true }), { label: "Réessayer", disabled: false });
  assert.deepEqual(payStepAction({ ...base, method: "", failed: true }), { label: "Réessayer", disabled: true });
  assert.deepEqual(
    payStepAction({ ...base, method: "card", failed: true, cardOpen: true, cardComplete: false }),
    { label: "Réessayer", disabled: true }
  );
  assert.deepEqual(
    payStepAction({ ...base, method: "card", failed: true, cardOpen: true, cardComplete: true }),
    { label: "Réessayer", disabled: false }
  );
  assert.deepEqual(payStepAction({ ...base, method: "card", sending: true }), { label: "Vérification…", disabled: true });
  assert.equal(payStepAction({ ...base, method: "agency", offerReady: false }).disabled, true);
  assert.equal(payStepAction({ ...base, method: "agency", nonRefundableAck: false }).disabled, true);
  assert.equal(payStepAction({ ...base, method: "agency", nonRefundableAck: true }).disabled, false);
  assert.equal(rateCancelBadge({ free: false }), "Non remboursable");
  assert.equal(
    rateCancelBadge({ free: true, deadlineLabel: "9 février 2027 à 18:00" }),
    "Annulation gratuite jusqu’au 9 février 2027 à 18:00"
  );
});

test("choisir un mode ne lance pas la réservation", () => {
  const journey = readFileSync(join(import.meta.dirname, "../../components/account/HotelJourney.tsx"), "utf8");
  assert.match(journey, /role="radiogroup"/);
  assert.match(journey, /aria-label="Règlement"/);
  assert.match(journey, /role="radio"/);
  assert.match(journey, /aria-checked=\{selected\}/);
  assert.match(journey, /onClick=\{\(\) => choosePay\(method\)\}/);
  assert.match(journey, /useState<PayMethod \| "">\(""\)/);
  assert.doesNotMatch(journey, /sendCard\.current/);
  assert.doesNotMatch(journey, /Autoriser la carte/);
  const choose = journey.slice(journey.indexOf("function choosePay"), journey.indexOf("function movePay"));
  assert.match(choose, /setPayMethod\(next\)/);
  assert.doesNotMatch(choose, /send\(/);
  assert.match(journey, /StayBenefits/);
  assert.match(journey, /J’ai compris que ce tarif n’est pas remboursable/);
  assert.match(journey, /data-hotel-cancel-badge/);
  assert.match(journey, /data-hotel-pay-choice/);
  assert.match(journey, /data-hotel-rate-choice/);
  assert.match(journey, /HotelWait/);
  assert.doesNotMatch(journey, /Nous vérifions le tarif en temps réel/);
});

function sampleRate(partial: Partial<ClientRate> = {}): ClientRate {
  return {
    offerId: "offre",
    room: "Chambre",
    title: "Best Available Rate",
    detail: "",
    cancellation: "Annulation gratuite jusqu’au 12 février 2027 à 23:59",
    benefits: [],
    footnotes: [],
    sellCents: 25196,
    perNightCents: 25196,
    currency: "EUR",
    images: [],
    deadlineLabel: "12 février 2027 à 23:59",
    ...partial,
    perks: { ...NONE, freeCancellation: true, ...partial.perks },
  };
}

test("deux tarifs identiques n’en font qu’un, une pension différente reste", () => {
  const same = presentRates([
    sampleRate({ offerId: "a" }),
    sampleRate({ offerId: "b", title: "Public" }),
  ]);
  assert.equal(same.length, 1);
  assert.equal(initialRate(same)?.offerId, "a");

  const split = presentRates([
    sampleRate({ offerId: "bb", title: "Room only", perks: { ...NONE, freeCancellation: false } }),
    sampleRate({ offerId: "pdj", title: "Breakfast included" }),
  ]);
  assert.equal(split.length, 2);
  assert.equal(initialRate([]) , null);
});
