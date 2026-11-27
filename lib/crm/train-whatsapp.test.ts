import assert from "node:assert/strict";
import test from "node:test";
import { partyHasChild, seatingPreference, trainFormDefaults, TRAIN_DEFAULT_OUTBOUND, TRAIN_DEFAULT_RETURN } from "./train-request";
import { trainRecipeMarkdown, trainRecipes } from "./train-recipe";
import { trainTicketSendWindow } from "./train-ticket-plan";
import { runMorningTrainTickets } from "./train-billets-run";
import { deliverTrainPlan } from "./train-send";
import {
  nextTrainTurn,
  parseTrainOffers,
  trainAccordContentCreateBody,
  trainClasseContentCreateBody,
  TRAIN_CARD_MEDIA,
  TRAIN_CHOOSE_TITLE,
  trainCarouselContentCreateBody,
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

test("les modèles portent les boutons et le carrousel", () => {
  assert.equal(trainClasseContentCreateBody().types["twilio/quick-reply"].actions.length, 2);
  assert.equal(trainTarifContentCreateBody().types["twilio/quick-reply"].actions.length, 2);
  assert.equal(trainAccordContentCreateBody().types["twilio/quick-reply"].actions.length, 3);
  const carousel = trainCarouselContentCreateBody().types["twilio/carousel"];
  assert.equal(carousel.cards.length, 4);
  assert.equal(carousel.cards[0].title, "{{4}}");
  assert.equal(carousel.cards[0].actions[0].title, TRAIN_CHOOSE_TITLE);
  assert.equal(carousel.cards[0].media, TRAIN_CARD_MEDIA);
  assert.equal(carousel.cards[3].title, "Autres horaires");
  assert.equal(carousel.cards[3].actions[0].id, "train:horaires");
  assert.equal(trainCarouselContentCreateBody(9).types["twilio/carousel"].cards.length, 10);
  for (const card of carousel.cards) {
    assert.ok(card.title.length + card.body.length <= 160);
    assert.equal(card.actions.length, 1);
    assert.equal(card.actions[0].type, "QUICK_REPLY");
  }
  assert.match(carousel.body, /faites défiler/);
  assert.doesNotMatch(carousel.body, /dans la liste/);
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
  assert.equal(hours?.steps[1]?.statut, "propositions");
  assert.equal(hours?.steps[2]?.statut, "recherche");
  const wait = recipes.find((recipe) => recipe.id === "relance-prix");
  assert.ok(wait?.steps.some((row) => row.statut === "en_attente"));
  assert.ok(wait?.steps.some((row) => row.statut === "prix_a_reconfirmer"));
  assert.match(wait?.steps.at(-1)?.bubbles[0]?.text || "", /135 €/);
  const family = recipes.find((recipe) => recipe.id === "famille");
  assert.match(family?.placement || "", /salle basse/);
  const round = recipes.find((recipe) => recipe.id === "aller-retour");
  const outbound = round?.steps[0]?.bubbles[0]?.cards || [];
  const back = round?.steps[1]?.bubbles.find((bubble) => bubble.cards)?.cards || [];
  assert.equal(outbound.length, 4);
  assert.equal(back.length, 4);
  assert.match(outbound[0]?.title || "", /08h12 → 10h05/);
  assert.match(outbound[0]?.body || "", /train 6601/);
  assert.match(back[0]?.title || "", /16h12 → 18h05/);
  assert.match(back[0]?.body || "", /train 6630/);
  assert.equal(outbound[0]?.button, "Choisir ce train");
  assert.equal(outbound.at(-1)?.title, "Autres horaires");
  for (const card of [...outbound, ...back]) assert.ok(card.title.length + card.body.length <= 160);
  assert.match(trainRecipeMarkdown(recipes), /Je confirme/);
});

test("moins de 3 trains est refusé, un numéro tapé ne choisit pas", async () => {
  const few = parseTrainOffers([{ numero: "6601" }, { numero: "6603" }], "Aller", { min: 3, max: 9 });
  if (!("error" in few)) assert.fail("moins de 3 trains doit être refusé");
  assert.match(few.error, /au moins 3 trains/);
  const base = {
    status: "propositions",
    step: "aller" as const,
    aller: [
      { numero: "6601", depart_gare: "Paris", arrivee_gare: "Lyon", date: "2026-06-02", heure_depart: "08:12", heure_arrivee: "10:05" },
      { numero: "6603", depart_gare: "Paris", arrivee_gare: "Lyon", date: "2026-06-02", heure_depart: "10:18", heure_arrivee: "12:11" },
      { numero: "6611", depart_gare: "Paris", arrivee_gare: "Lyon", date: "2026-06-02", heure_depart: "14:12", heure_arrivee: "16:05" },
    ],
    retour: [],
    choix_aller: null,
    choix_retour: null,
    classe: null,
    tarif: null,
    ambigu_compte: 0,
    besoin_agence: false,
  };
  const typed = nextTrainTurn({ state: base, greeting: "Camille", depart: "Paris", arrivee: "Lyon", body: "2" });
  assert.equal(typed.action, "reposer");
  const savedListe = process.env.TWILIO_CONTENT_TRAIN_CARROUSEL_3;
  delete process.env.TWILIO_CONTENT_TRAIN_CARROUSEL_3;
  let called = false;
  const card = (id: string) => ({
    title: "08h12 → 10h05",
    body: "Paris → Lyon, train",
    media: "https://travelba.fr/whatsapp/train-carte.jpg",
    actions: [{ type: "QUICK_REPLY" as const, title: "Choisir ce train", id }],
  });
  const plan = {
    modele: "train_carrousel" as const,
    corps: "Faites défiler les trains.",
    variables: { "1": "Camille" },
    carrousel: { language: "fr", types: { "twilio/carousel": { body: "x", cards: [card("train:aller:0"), card("train:aller:1"), card("train:aller:2"), card("train:horaires")] } } },
  };
  const sent = await deliverTrainPlan({
    phone: "+33600000000",
    plan,
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(called, false);
  assert.equal(sent.ok, false);
  if (savedListe !== undefined) process.env.TWILIO_CONTENT_TRAIN_CARROUSEL_3 = savedListe;
  const savedBillet = process.env.TWILIO_CONTENT_TRAIN_BILLET;
  delete process.env.TWILIO_CONTENT_TRAIN_BILLET;
  const morning = await runMorningTrainTickets({ from() { throw new Error("pas de lecture"); } } as never);
  assert.match(morning.raison || "", /TWILIO_CONTENT_TRAIN_BILLET absente/);
  assert.equal(morning.envoyes, 0);
  if (savedBillet !== undefined) process.env.TWILIO_CONTENT_TRAIN_BILLET = savedBillet;
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
