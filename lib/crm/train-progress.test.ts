import assert from "node:assert/strict";
import test from "node:test";
import { trainAgentHint, trainProgress, type TrainProgressInput } from "./train-progress";
import type { TrainOffer } from "./train-whatsapp";

const ALLER: TrainOffer[] = [
  { numero: "6601", depart_gare: "Paris", arrivee_gare: "Lyon", date: "2026-06-02", heure_depart: "08:12", heure_arrivee: "10:05" },
  { numero: "6615", depart_gare: "Paris", arrivee_gare: "Lyon", date: "2026-06-02", heure_depart: "12:18", heure_arrivee: "14:11" },
];

function row(partial: Partial<TrainProgressInput>): TrainProgressInput {
  return {
    status: "nouvelle",
    step: "aller",
    createdAt: "2026-11-27T08:00:00.000Z",
    updatedAt: "2026-11-27T08:16:00.000Z",
    aller: [],
    retour: [],
    choixAller: null,
    choixRetour: null,
    classe: null,
    tarif: null,
    reference: null,
    prix: null,
    billets: [],
    retourDate: "2026-06-03",
    ...partial,
  };
}

function current(input: TrainProgressInput) {
  return trainProgress(input).etapes.find((step) => step.state === "cours")?.label || "";
}

test("chaque statut a une phrase pour l’agent", () => {
  assert.match(trainAgentHint("nouvelle"), /bot va prendre/);
  assert.match(trainAgentHint("recherche"), /bot cherche/);
  assert.match(trainAgentHint("propositions"), /client choisit/);
  assert.match(trainAgentHint("choix"), /bot achète/);
  assert.match(trainAgentHint("annulee"), /annulée/);
});

test("la demande nouvelle surligne la création, pas la recherche", () => {
  const suivi = trainProgress(row({}));
  assert.equal(current(row({})), "Demande créée");
  assert.match(suivi.maintenant, /bot va prendre/);
  assert.equal(suivi.etapes[0]?.quand, trainProgress(row({})).etapes[0]?.quand);
  assert.ok(suivi.etapes.every((step) => step.id !== "creee" || step.quand));
  assert.equal(suivi.etapes.filter((step) => step.state === "cours").length, 1);
});

test("la recherche et les propositions nomment l’étape et les trains", () => {
  assert.match(trainProgress(row({ status: "recherche" })).maintenant, /bot cherche/);
  const offres = trainProgress(row({ status: "propositions", aller: ALLER, retour: [{ ...ALLER[0], numero: "6630", heure_depart: "16:12", heure_arrivee: "18:05" }] }));
  assert.equal(current(row({ status: "propositions", aller: ALLER })), "Envoyées au client sur WhatsApp");
  assert.match(offres.maintenant, /client choisit/);
  assert.equal(offres.cartes[0]?.departHeure, "08h12");
  assert.equal(offres.cartes[0]?.arriveeHeure, "10h05");
  assert.equal(offres.cartes[0]?.numero, "train 6601");
  assert.equal(offres.cartes.length, 3);
  assert.match(offres.message?.texte || "", /horaires de train/);
  assert.equal(offres.message?.quand, null);
});

test("les cartes portent durée, prix et le train choisi, sans inventer la liaison", () => {
  const suivi = trainProgress(
    row({
      status: "propositions",
      depart: "Paris",
      arrivee: "Montpellier",
      choixAller: 0,
      aller: [
        {
          ...ALLER[0],
          duree: "3h18",
          prix: { "2de": { non_remboursable: 74 }, "1re": { flex: 184, non_remboursable: 91 } },
        },
        Object.assign({ ...ALLER[1] }, { correspondances: 1 }),
      ],
    }),
  );
  assert.equal(suivi.cartes[0]?.duree, "3 h 18");
  assert.equal(suivi.cartes[0]?.choisi, true);
  assert.equal(suivi.cartes[0]?.liaison, null);
  assert.deepEqual(
    suivi.cartes[0]?.prix.map((chip) => chip.label),
    ["2de", "1re", "1re Flex"],
  );
  assert.equal(suivi.cartes[1]?.liaison, "1 correspondance");
  assert.match(suivi.message?.texte || "", /Paris → Montpellier/);
  assert.equal(trainProgress(row({ status: "recherche" })).message, null);
});

test("les choix avancent la surbrillance, puis l’achat et le billet", () => {
  assert.equal(current(row({ status: "propositions", aller: ALLER, choixAller: 0 })), "Tarif choisi");
  assert.equal(current(row({ status: "propositions", step: "tarif", aller: ALLER, choixAller: 0, tarif: "flex" })), "Retour choisi");
  assert.equal(current(row({ status: "propositions", step: "classe", aller: ALLER, choixAller: 0, choixRetour: 0, retour: ALLER, tarif: "flex" })), "Classe choisie");
  assert.match(trainProgress(row({ status: "choix", aller: ALLER, choixAller: 0, tarif: "flex", classe: "1re", retour: [], retourDate: null })).maintenant, /bot achète/);
  const commande = trainProgress(row({ status: "commande", aller: ALLER, choixAller: 0, tarif: "flex", classe: "1re", retourDate: null, reference: "SNCF1", prix: 90, updatedAt: "2026-11-27T09:00:00.000Z" }));
  assert.match(commande.etapes.find((step) => step.id === "commande")?.detail || "", /SNCF1/);
  assert.match(commande.etapes.find((step) => step.id === "commande")?.detail || "", /90/);
  assert.match(commande.maintenant, /matin du départ/);
  const parti = trainProgress(row({ status: "commande", aller: ALLER, choixAller: 0, tarif: "flex", classe: "1re", retourDate: null, reference: "SNCF1", prix: 90, billets: ["2026-06-02"] }));
  assert.equal(current(row({ status: "commande", aller: ALLER, choixAller: 0, tarif: "flex", classe: "1re", retourDate: null, billets: ["2026-06-02"] })), "Billet envoyé le jour J");
  assert.match(parti.maintenant, /billet est parti/);
});

test("les branches remplacent la surbrillance", () => {
  assert.equal(trainProgress(row({ status: "en_attente", aller: ALLER })).branche?.label, "En attente");
  assert.match(trainProgress(row({ status: "prix_a_reconfirmer", aller: ALLER, choixAller: 0, tarif: "flex", classe: "1re" })).maintenant, /revérifie le prix/);
  assert.equal(trainProgress(row({ status: "recherche", aller: ALLER })).branche?.label, "Train indisponible");
  assert.equal(trainProgress(row({ status: "annulee", step: "fait" })).branche?.label, "Refusé");
  assert.equal(trainProgress(row({ status: "annulee", step: "aller" })).branche?.label, "Annulé");
  assert.equal(trainProgress(row({ status: "en_attente" })).etapes.some((step) => step.state === "cours"), false);
});
