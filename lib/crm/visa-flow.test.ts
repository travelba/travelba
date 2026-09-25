import assert from "node:assert/strict";
import test from "node:test";
import { VISA_EUR } from "./extras";
import { VISA_OFFICIAL } from "./visa-fees";
import {
  acceptVisaDecision,
  agencyLaunchReady,
  astraFillsCountry,
  canReturnToOffer,
  clientVisaPhase,
  clientVisaProgress,
  clientVisaStepCopy,
  clientVisaStepNote,
  clientVisaTrack,
  confirmAllowed,
  depositAdvancesToPiece,
  hasEstaAnswers,
  headerVisaLabel,
  journeyStarted,
  launchWouldRewind,
  mergeEstaAnswers,
  nextPayAttempt,
  paymentHold,
  phaseForSavedStep,
  readEstaAnswers,
  stepAfterPrepare,
  visaConfirmationCopy,
  visaPriceOnCard,
  visibilityOnRequest,
  whatsappOnVisa,
} from "./visa-flow";

test("le bouton agence attend les réponses États-Unis et Royaume-Uni", () => {
  assert.equal(agencyLaunchReady("IL", null), true);
  assert.equal(agencyLaunchReady("GB", { priorRefusal: "" }), false);
  assert.equal(agencyLaunchReady("GB", { priorRefusal: "non" }), true);
  assert.equal(agencyLaunchReady("US", { priorRefusal: "non" }), false);
  assert.equal(
    agencyLaunchReady("US", {
      usAddress: "hôtel",
      employment: "agence",
      countriesVisited: "France",
      priorRefusal: "non",
    }),
    true
  );
});

test("le client voit préparer, en cours, puis le coffre", () => {
  assert.equal(clientVisaPhase({ started: false, filed: false }), "à préparer");
  assert.equal(clientVisaPhase({ started: true, filed: false }), "en cours");
  assert.equal(clientVisaPhase({ started: true, filed: true }), "au coffre");
});

test("le client suit les grandes étapes, jusqu’à la pièce", () => {
  const track = clientVisaTrack("remplissage");
  assert.equal(track[0].state, "fait");
  assert.equal(track[1].state, "en cours");
  assert.equal(track[1].label, "Remplissage");
  assert.equal(track[4].state, "à venir");
  assert.equal(clientVisaTrack("piece").every((row) => row.state === "fait"), true);
  assert.match(clientVisaStepCopy("remplissage"), /formulaire officiel/);
  assert.match(clientVisaStepCopy("preparation"), /pièces du voyage/);
  assert.match(clientVisaStepCopy("piece"), /autorisation est prête/);
});

test("une demande déjà ouverte peut être confirmée", () => {
  assert.equal(confirmAllowed({ already: ["IL"], country: "IL", frenchPassports: 1, resumable: true }), null);
});

test("ouvrir la demande ne révèle pas les prix", () => {
  assert.deepEqual(visibilityOnRequest({ visible: false, prices: false }), {
    visible: true,
    prices: false,
  });
  assert.equal(visibilityOnRequest({ visible: true, prices: true }).prices, true);
});

test("sans Pliant le parcours s’arrête au paiement", () => {
  assert.match(paymentHold(false) || "", /paiement/);
  assert.equal(paymentHold(true), null);
  assert.match(clientVisaStepNote("paiement", { paymentHeld: true }) || "", /Pliant/);
  assert.match(clientVisaStepNote("paiement", { paid: true }) || "", /enregistré/);
  assert.match(clientVisaStepNote("remplissage") || "", /formulaire officiel/);
});

test("Israël, États-Unis et Royaume-Uni suivent le parcours jusqu’au paiement", () => {
  assert.equal(stepAfterPrepare("IL"), "remplissage");
  assert.equal(stepAfterPrepare("US"), "validation");
  assert.equal(stepAfterPrepare("GB"), "validation");
  assert.equal(phaseForSavedStep(null), null);
  assert.equal(phaseForSavedStep("preparation"), "prêt");
  assert.equal(phaseForSavedStep("remplissage"), "prêt");
  assert.equal(phaseForSavedStep("validation"), "à confirmer");
  assert.equal(phaseForSavedStep("paiement"), "paiement");
  assert.equal(phaseForSavedStep("piece"), "piece");
  assert.equal(launchWouldRewind("preparation"), false);
  assert.equal(launchWouldRewind("validation"), true);
  assert.equal(headerVisaLabel(null, "US"), "Lancer le parcours");
  assert.equal(headerVisaLabel("prêt", "IL"), "Remplir le portail");
  assert.equal(headerVisaLabel("prêt", "GB"), "Préparer le récapitulatif");
  assert.equal(headerVisaLabel("à confirmer", "US"), "Confirmer");
  assert.equal(headerVisaLabel("paiement", "IL"), "Paiement en attente");
});

test("le pourcentage suit le palier, Astra ne couvre qu’Israël", () => {
  assert.equal(clientVisaProgress("preparation"), 20);
  assert.equal(clientVisaProgress("remplissage"), 45);
  assert.equal(clientVisaProgress("validation"), 65);
  assert.equal(clientVisaProgress("paiement"), 80);
  assert.equal(clientVisaProgress("piece"), 100);
  assert.equal(astraFillsCountry("IL"), true);
  assert.equal(astraFillsCountry("US"), false);
  assert.equal(astraFillsCountry("GB"), false);
});

test("les réponses déjà données restent, le dépôt n’avance qu’après paiement", () => {
  assert.deepEqual(
    mergeEstaAnswers({ priorRefusal: "non", usAddress: "hôtel" }, { usAddress: "  " }),
    { usAddress: "hôtel", employment: "", countriesVisited: "", priorRefusal: "non" }
  );
  assert.equal(readEstaAnswers({ priorRefusal: " oui ", noise: 1 }).priorRefusal, "oui");
  assert.equal(hasEstaAnswers({ employment: "agence" }), true);
  assert.equal(hasEstaAnswers({}), false);
  assert.equal(depositAdvancesToPiece("paye"), true);
  assert.equal(depositAdvancesToPiece("en_cours"), false);
});

test("pas de parcours sans validation, même à 45 %", () => {
  assert.equal(clientVisaProgress("remplissage"), 45);
  assert.equal(journeyStarted({ step: "remplissage" }), false);
  assert.equal(journeyStarted({ step: "preparation" }), false);
  assert.equal(journeyStarted({ step: "validation" }), false);
  assert.equal(journeyStarted({ step: "paiement" }), false);
  assert.equal(journeyStarted({ step: "piece" }), false);
  assert.equal(journeyStarted(null), false);
  const blocked = acceptVisaDecision({
    confirm: false,
    travelerIds: ["a", "b"],
    partyIds: ["a", "b"],
    alreadyAccepted: false,
    step: "remplissage",
  });
  assert.equal(blocked.start, false);
  if (!blocked.start) assert.match(blocked.error, /Confirmez/);
  const started = acceptVisaDecision({
    confirm: true,
    travelerIds: ["a"],
    partyIds: ["a", "b"],
    alreadyAccepted: false,
    step: "remplissage",
    status: "en_cours",
  });
  assert.equal(started.start, true);
  if (started.start) {
    assert.deepEqual(started.travelerIds, ["a"]);
    assert.equal(started.step, "preparation");
    assert.notEqual(started.step, "piece");
  }
  assert.equal(journeyStarted({ step: "remplissage", accepted_at: "2026-09-25T09:00:00.000Z" }), true);
});

test("le prix n’apparaît que dans la confirmation", () => {
  assert.equal(visaPriceOnCard(), null);
  const copy = visaConfirmationCopy({ travelers: 2, country: "IL" });
  assert.match(copy, new RegExp(`${2 * VISA_EUR} €`));
  assert.match(copy, new RegExp(`${VISA_EUR} € par passager`));
  assert.match(copy, new RegExp(`${VISA_OFFICIAL.IL.amount} ${VISA_OFFICIAL.IL.currency}`));
  assert.match(visaConfirmationCopy({ travelers: 1, country: "US" }), new RegExp(String(VISA_OFFICIAL.US.amount)));
  assert.match(visaConfirmationCopy({ travelers: 1, country: "GB" }), new RegExp(String(VISA_OFFICIAL.GB.amount)));
});

test("pas de retour arrière une fois la demande confirmée", () => {
  assert.equal(canReturnToOffer({ accepted_at: null }), true);
  assert.equal(canReturnToOffer({ accepted_at: "2026-09-25T09:00:00.000Z" }), false);
  assert.equal(canReturnToOffer({ accepted: true }), false);
  const again = acceptVisaDecision({
    confirm: true,
    travelerIds: ["a"],
    partyIds: ["a"],
    alreadyAccepted: true,
    step: "remplissage",
  });
  assert.equal(again.start, false);
  if (!again.start) assert.match(again.error, /déjà lancé/);
  const paying = acceptVisaDecision({
    confirm: true,
    travelerIds: ["a"],
    partyIds: ["a"],
    alreadyAccepted: false,
    step: "paiement",
    status: "en_cours",
  });
  assert.equal(paying.start, true);
  if (paying.start) assert.equal(paying.step, "paiement");
  assert.match(paymentHold(false) || "", /paiement/);
  assert.equal(whatsappOnVisa("validation"), false);
  assert.equal(whatsappOnVisa("piece"), true);
});

test("un second paiement échoué alerte, un second pays identique ne part pas", () => {
  assert.equal(nextPayAttempt(0), "pay");
  assert.equal(nextPayAttempt(1), "retry");
  assert.equal(nextPayAttempt(2), "alert");
  assert.equal(confirmAllowed({ already: ["IL"], country: "IL", frenchPassports: 1 }), "déjà demandé");
  assert.equal(confirmAllowed({ already: [], country: "US", frenchPassports: 1, esta: {} }), "questionnaire ESTA incomplet");
  assert.equal(
    confirmAllowed({
      already: [],
      country: "US",
      frenchPassports: 2,
      esta: {
        usAddress: "hôtel",
        employment: "agence",
        countriesVisited: "France",
        priorRefusal: "non",
      },
    }),
    null
  );
});
