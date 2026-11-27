import assert from "node:assert/strict";
import test from "node:test";
import { trainBotEventsForTurn } from "./train-bot";
import { parseTrainAssistant, trainAssistantSystem, trainOutsideScope } from "./train-assistant";
import { trainIaEnabled } from "./train-journal";
import { planTrainDesk, type TrainDeskRow } from "./train-desk";

const row: TrainDeskRow = {
  id: "0acf8091-4101-4c7a-aabe-c0dd8756d2b5",
  booking_id: "dossier",
  status: "propositions",
  depart_ville: "Paris",
  arrivee_ville: "Montpellier",
  aller_date: "2027-03-29",
  aller_creneau: "À partir de 8h",
  retour_date: "2027-03-30",
  retour_creneau: "À partir de 16h",
  aller: [{ numero: "6255", depart_gare: "Paris", arrivee_gare: "Montpellier", date: "2027-03-29", heure_depart: "08:52", heure_arrivee: "12:10" }],
  retour: [{ numero: "6873", depart_gare: "Montpellier", arrivee_gare: "Paris", date: "2027-03-30", heure_depart: "18:02", heure_arrivee: "22:04" }],
  choix_aller: 0,
  choix_retour: 0,
  classe: "2de",
  tarif: "non_remboursable",
  pause: false,
  prise_en_main: false,
  ia: null,
  journal: [],
};

test("le webhook couvre l’accord, la relance et le choix", () => {
  assert.deepEqual(trainBotEventsForTurn({ action: "choix", patch: { status: "choix" } }), ["accord"]);
  assert.deepEqual(trainBotEventsForTurn({ action: "delai", patch: { status: "en_attente" } }), ["relance"]);
  assert.deepEqual(trainBotEventsForTurn({ action: "reprise", patch: {} }), ["prix_a_reconfirmer"]);
  assert.deepEqual(trainBotEventsForTurn({ action: "refuse", patch: {} }), ["refus"]);
  assert.deepEqual(trainBotEventsForTurn({ action: "question", patch: { choix_aller: 0, step: "tarif" } }), ["choix_recu"]);
  assert.deepEqual(trainBotEventsForTurn({ action: "reposer", patch: { ambigu_compte: 1 } }), []);
});

test("l’assistant reste dans le train et n’achète pas", () => {
  assert.equal(trainOutsideScope("je veux un remboursement"), true);
  assert.equal(trainOutsideScope("le 08h52 me va"), false);
  assert.match(trainAssistantSystem(), /n’achètes rien/);
  assert.match(trainAssistantSystem(), /aucun prix/);
  const reply = parseTrainAssistant(JSON.stringify({ texte: "On part sur le 08h52 ?", geste: "aucun", contrainte: "" }));
  assert.equal(reply.geste, "aucun");
  assert.match(reply.texte, /08h52/);
  assert.equal(parseTrainAssistant("{").geste, "aucun");
});

test("l’IA est coupée sans clé, en pause ou en prise en main", () => {
  assert.equal(trainIaEnabled({ key: "", globalOn: true, ia: null }), false);
  assert.equal(trainIaEnabled({ key: "sk", globalOn: true, ia: null, pause: true }), false);
  assert.equal(trainIaEnabled({ key: "sk", globalOn: true, ia: null, prise_en_main: true }), false);
  assert.equal(trainIaEnabled({ key: "sk", globalOn: false, ia: true }), true);
  assert.equal(trainIaEnabled({ key: "sk", globalOn: true, ia: false }), false);
});

test("les actions de la fiche écrivent le suivi et préviennent le bot", () => {
  const prix = planTrainDesk(row, "reverifier");
  assert.equal(prix.bot, "prix_a_reconfirmer");
  assert.match(prix.journal.at(-1)?.texte || "", /revérifier/);
  const pause = planTrainDesk(row, "pause");
  assert.equal(pause.patch.pause, true);
  const main = planTrainDesk(row, "prendre");
  assert.equal(main.patch.prise_en_main, true);
  const rappel = planTrainDesk(row, "relancer", { sessionOuverte: true, prenom: "Benjamin" });
  assert.equal(rappel.envoie, "rappel");
  assert.match(rappel.texte, /6255/);
  assert.doesNotMatch(rappel.texte, /€/);
  const hors = planTrainDesk(row, "relancer", { sessionOuverte: false, prenom: "Benjamin" });
  assert.equal(hors.envoie, "accroche");
  const cherche = planTrainDesk(row, "changer", { aller_date: "2027-04-01" });
  assert.equal(cherche.bot, "recherche");
  assert.equal(cherche.patch.aller_date, "2027-04-01");
  assert.equal(cherche.patch.status, "recherche");
});
