import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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
  visaRequestShown,
  launchWouldRewind,
  mergeEstaAnswers,
  nextPayAttempt,
  paymentHold,
  phaseForSavedStep,
  readEstaAnswers,
  stepAfterPrepare,
  clientVisaStepLabel,
  confirmBlockMessage,
  decideVisaLaunch,
  estaAnswersFrom,
  formalityName,
  frenchPassportCount,
  missingLaunchAnswers,
  parseVisaCorridor,
  visaConfirmationCopy,
  visaJourneyLines,
  visaLaunchSummary,
  visaPriceOnCard,
  visaResetPatch,
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
  assert.equal(visaRequestShown({}, []), false);
  assert.equal(visaRequestShown({ offer_visa: false }, [{ accepted_at: null }]), false);
  assert.equal(visaRequestShown({ offer_visa: true }, []), true);
  assert.equal(visaRequestShown({}, [{ accepted_at: "2026-10-01T09:00:00.000Z" }]), true);
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

test("recommencer remet le client sur la carte de départ", () => {
  const fresh = visaResetPatch();
  assert.equal(fresh.accepted_at, null);
  assert.equal(fresh.step, "preparation");
  assert.equal(fresh.status, "en_cours");
  assert.deepEqual(fresh.traveler_ids, []);
  assert.equal(fresh.launched_by, null);
  assert.equal(fresh.launched_by_name, null);
  assert.equal(journeyStarted(fresh), false);
  assert.equal(canReturnToOffer(fresh), true);
  const again = acceptVisaDecision({
    confirm: true,
    travelerIds: ["a"],
    partyIds: ["a"],
    alreadyAccepted: Boolean(fresh.accepted_at),
    step: fresh.step,
    status: fresh.status,
  });
  assert.equal(again.start, true);
  if (again.start) assert.equal(again.step, "preparation");
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

const ESTA = {
  usAddress: "hôtel",
  employment: "agence",
  countriesVisited: "France",
  priorRefusal: "non",
};

test("un refus de formalité dit ce qui manque", () => {
  assert.match(confirmBlockMessage("passeport français manquant") || "", /Passeport français manquant/);
  assert.match(confirmBlockMessage("passeport français manquant") || "", /numéro/);
  assert.match(
    confirmBlockMessage("questionnaire ESTA incomplet", "US", { usAddress: "hôtel" }) || "",
    /l’emploi/
  );
  assert.match(confirmBlockMessage("antécédent de refus manquant", "GB", {}) || "", /Royaume-Uni/);
  assert.equal(confirmBlockMessage(null), null);
  assert.deepEqual(missingLaunchAnswers("IL", null), []);
  assert.deepEqual(missingLaunchAnswers("GB", { priorRefusal: "non" }), []);
  assert.equal(frenchPassportCount([{ doc_type: "passport", issuing_country: "FR", number: "12AB" }]), 1);
  assert.equal(frenchPassportCount([{ doc_type: "passport", issuing_country: "FR", number: "" }]), 0);
  assert.equal(parseVisaCorridor("ESTA"), "US");
  assert.equal(parseVisaCorridor("Royaume-Uni"), "GB");
  assert.equal(parseVisaCorridor("ETA-IL"), "IL");
  assert.equal(parseVisaCorridor("eta"), null);
  assert.equal(estaAnswersFrom({ adresse: " hôtel ", emploi: "agence", pays_visites: "France", refus: "non" }).usAddress, "hôtel");
  assert.equal(formalityName("US"), "ESTA");
  assert.equal(clientVisaStepLabel("preparation"), "Préparation");
  assert.equal(visaLaunchSummary("GB", "Camille Martin"), "ETA Royaume-Uni lancée pour le client par Camille Martin.");
});

test("lancer sans confirmer montre le prix et n’écrit rien", () => {
  const preview = decideVisaLaunch({
    confirm: false,
    country: "US",
    requestedTravelerIds: null,
    party: [
      { id: "a", nom: "Ada Martin" },
      { id: "b", nom: "Léo Martin" },
    ],
    alreadyAccepted: false,
    frenchPassports: 1,
    answers: ESTA,
    offerVisa: false,
  });
  assert.equal(preview.kind, "preview");
  if (preview.kind !== "preview") return;
  assert.equal(preview.preview.lance, false);
  assert.equal(preview.preview.pret, true);
  assert.equal(preview.preview.prix_eur, 50);
  assert.match(preview.preview.frais_etat, /USD/);
  assert.match(preview.preview.message, /Rien n’est lancé/);
  assert.equal(preview.preview.voyageurs.filter((row) => row.retenu).length, 2);
});

test("confirmer sans passeport ou sans réponse ESTA reste lisible et ne lance pas", () => {
  const passport = decideVisaLaunch({
    confirm: true,
    country: "IL",
    requestedTravelerIds: ["a"],
    party: [{ id: "a", nom: "Ada Martin" }],
    alreadyAccepted: false,
    frenchPassports: 0,
    answers: {},
    offerVisa: false,
  });
  assert.equal(passport.kind, "refuse");
  if (passport.kind === "refuse") assert.match(passport.error, /Passeport français manquant/);
  const esta = decideVisaLaunch({
    confirm: true,
    country: "US",
    requestedTravelerIds: null,
    party: [{ id: "a", nom: "Ada Martin" }],
    alreadyAccepted: false,
    frenchPassports: 1,
    answers: { priorRefusal: "non" },
    offerVisa: true,
  });
  assert.equal(esta.kind, "refuse");
  if (esta.kind === "refuse") assert.match(esta.error, /Questionnaire ESTA incomplet/);
  const unknown = decideVisaLaunch({
    confirm: true,
    country: "IL",
    requestedTravelerIds: ["autre"],
    party: [{ id: "a", nom: "Ada Martin" }],
    alreadyAccepted: false,
    frenchPassports: 1,
    answers: {},
    offerVisa: true,
  });
  assert.equal(unknown.kind, "refuse");
  if (unknown.kind === "refuse") assert.match(unknown.error, /ne fait pas partie/);
});

test("confirmer lance le même parcours et retient l’auteur dans le statut", () => {
  const launch = decideVisaLaunch({
    confirm: true,
    country: "IL",
    requestedTravelerIds: ["a"],
    party: [
      { id: "a", nom: "Ada Martin" },
      { id: "b", nom: "Léo Martin" },
    ],
    alreadyAccepted: false,
    frenchPassports: 1,
    answers: {},
    offerVisa: false,
  });
  assert.equal(launch.kind, "launch");
  if (launch.kind !== "launch") return;
  assert.deepEqual(launch.travelerIds, ["a"]);
  assert.equal(launch.step, "preparation");
  assert.equal(launch.enableOffer, true);
  assert.equal(launch.fillIsrael, true);
  const again = decideVisaLaunch({
    confirm: true,
    country: "IL",
    requestedTravelerIds: ["a"],
    party: [{ id: "a", nom: "Ada Martin" }],
    alreadyAccepted: true,
    frenchPassports: 1,
    answers: {},
    offerVisa: true,
  });
  assert.equal(again.kind, "refuse");
  const lines = visaJourneyLines({
    travelers: [{ id: "a", nom: "Ada Martin" }],
    detected: ["US", "IL"],
    requests: [
      {
        country: "IL",
        step: "preparation",
        status: "en_cours",
        accepted_at: "2026-11-02T12:00:00.000Z",
        traveler_ids: ["a"],
        launched_by_name: "Camille Martin",
      },
    ],
  });
  assert.equal(lines[0].code, "US");
  assert.equal(lines[0].lance, false);
  assert.equal(lines[0].etape, "Pas lancée");
  assert.equal(lines[1].lance, true);
  assert.equal(lines[1].etape, "Préparation");
  assert.equal(lines[1].lance_par, "Camille Martin");
  assert.deepEqual(lines[1].voyageurs, ["Ada Martin"]);
});

test("le dossier agence propose de lancer la demande avant le parcours", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const screen = readFileSync(join(root, "components/crm/VisaJourney.tsx"), "utf8");
  assert.match(screen, /Lancer la demande pour le client/);
  assert.match(screen, /action: "lancer"/);
  const route = readFileSync(join(root, "app/api/admin/bookings/[id]/visa/route.ts"), "utf8");
  assert.match(route, /action === "lancer"/);
  assert.match(route, /launchVisaForAgency/);
  assert.match(route, /lance_par/);
});
