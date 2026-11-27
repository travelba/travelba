import assert from "node:assert/strict";
import test from "node:test";
import { partyHasChild, seatingPreference, trainFormDefaults, TRAIN_DEFAULT_OUTBOUND, TRAIN_DEFAULT_RETURN } from "./train-request";
import { trainRecipeMarkdown, trainRecipes } from "./train-recipe";
import { trainTicketSendWindow } from "./train-ticket-plan";
import {
  nextTrainTurn,
  trainAccordContentCreateBody,
  trainClasseContentCreateBody,
  trainListContentCreateBody,
  trainPropositionContentCreateBody,
  trainTarifContentCreateBody,
} from "./train-whatsapp";

test("dates d’hôtel et horaires par défaut", () => {
  const defaults = trainFormDefaults({
    homeCity: "Paris",
    hotels: [{ city: "Lyon", start: "2026-06-01T15:00:00", end: "2026-06-02T11:00:00" }],
  });
  assert.equal(defaults.depart, "Paris");
  assert.equal(defaults.arrivee, "Lyon");
  assert.equal(defaults.allerDate, "2026-06-01");
  assert.equal(defaults.retourDate, "2026-06-02");
  assert.equal(defaults.allerCreneau, TRAIN_DEFAULT_OUTBOUND);
  assert.equal(defaults.retourCreneau, TRAIN_DEFAULT_RETURN);
});

test("placement selon le nombre de voyageurs", () => {
  assert.match(seatingPreference({ count: 1, child: false }), /isolée ou côté fenêtre/);
  assert.match(seatingPreference({ count: 2, child: false }), /Côte à côte/);
  assert.match(seatingPreference({ count: 3, child: false }), /Deux côte à côte/);
  assert.match(seatingPreference({ count: 4, child: false }), /Carré/);
  assert.match(seatingPreference({ count: 4, child: true }), /salle basse/);
  assert.equal(partyHasChild([40, 8]), true);
  assert.equal(partyHasChild([40, null]), false);
});

test("les modèles portent les boutons et la liste", () => {
  assert.match(trainPropositionContentCreateBody().types["twilio/text"].body, /Autres horaires/);
  assert.equal(trainClasseContentCreateBody().types["twilio/quick-reply"].actions.length, 2);
  assert.equal(trainTarifContentCreateBody().types["twilio/quick-reply"].actions.length, 2);
  assert.equal(trainAccordContentCreateBody().types["twilio/quick-reply"].actions.length, 3);
  assert.equal(trainListContentCreateBody().types["twilio/list-picker"].items.length, 3);
});

test("le récapitulatif précède l’achat, et un refus n’achète pas", () => {
  const recipes = trainRecipes();
  const solo = recipes.find((recipe) => recipe.id === "aller-simple");
  assert.ok(solo);
  assert.equal(solo.steps.at(-1)?.statut, "choix");
  assert.match(solo.steps.at(-2)?.bubbles.map((bubble) => bubble.text).join("\n") || "", /Total/);
  assert.notEqual(solo.steps.at(-2)?.statut, "choix");
  const refused = recipes.find((recipe) => recipe.id === "refus");
  assert.equal(refused?.steps.at(-1)?.statut, "annulee");
  const hours = recipes.find((recipe) => recipe.id === "autres-horaires");
  assert.equal(hours?.steps[1]?.statut, "recherche");
  const wait = recipes.find((recipe) => recipe.id === "relance-prix");
  assert.ok(wait?.steps.some((row) => row.statut === "en_attente"));
  assert.ok(wait?.steps.some((row) => row.statut === "prix_a_reconfirmer"));
  assert.match(wait?.steps.at(-1)?.bubbles[0]?.text || "", /135 €/);
  const family = recipes.find((recipe) => recipe.id === "famille");
  assert.match(family?.placement || "", /salle basse/);
  assert.match(trainRecipeMarkdown(recipes), /Je confirme/);
});

test("une réponse incompréhensible passe la main au second essai", () => {
  const base = {
    status: "propositions",
    step: "aller" as const,
    aller: [
      {
        numero: "6601",
        depart_gare: "Paris",
        arrivee_gare: "Lyon",
        date: "2026-06-02",
        heure_depart: "08:12",
        heure_arrivee: "10:05",
      },
    ],
    retour: [],
    choix_aller: null,
    choix_retour: null,
    classe: null,
    tarif: null,
    ambigu_compte: 0,
    besoin_agence: false,
  };
  const first = nextTrainTurn({ state: base, greeting: "Camille", depart: "Paris", arrivee: "Lyon", body: "bof" });
  assert.equal(first.action, "reposer");
  const second = nextTrainTurn({
    state: { ...base, ambigu_compte: 1 },
    greeting: "Camille",
    depart: "Paris",
    arrivee: "Lyon",
    body: "heu",
  });
  assert.equal(second.action, "agence");
});

test("le billet part à 8h, ou deux heures avant si le train est tôt", () => {
  const morning = trainTicketSendWindow({
    departureLocal: "2026-06-02T10:05:00",
    timeZone: "Europe/Paris",
    now: Date.parse("2026-06-02T06:05:00Z"),
  });
  assert.equal(morning?.raison, "8h locale le jour du départ");
  assert.equal(morning?.due, true);
  const early = trainTicketSendWindow({
    departureLocal: "2026-06-02T07:30:00",
    timeZone: "Europe/Paris",
    now: Date.parse("2026-06-02T03:30:00Z"),
  });
  assert.equal(early?.raison, "deux heures avant le train");
  assert.equal(early?.due, true);
});
