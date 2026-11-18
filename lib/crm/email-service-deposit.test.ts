import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cardsDepositMessage,
  matchPliantProposals,
  readDepositServices,
} from "./email-service-deposit";
import type { PlannedStep } from "./email-step-plan";

const TAAP_CAR = `
Confirmation de voyage TAAP
Location de voiture
Peugeot 3008 ou similaire
Conducteur : Camille Martin
N° de confirmation : 81899756
Prise en charge et restitution
Nice (NCE)
04/04/2027 10:30
Nice (NCE)
11/04/2027 09:00
Loueur : Europcar
Prix total : 337,23 €
`;

describe("dépôt des cartes hors vol", () => {
  it("relit la location dans le corps et écarte l’hôtel creux", () => {
    const read = readDepositServices(
      {
        items: [
          {
            kind: "hotel",
            title: "Hôtel",
            confirmation_ref: "•••",
            start_at: null,
            amount: 337.23,
            details: { document_amount: 337.23 },
          },
        ],
        travelers: [{ first_name: "Camille", last_name: "Martin" }],
      },
      TAAP_CAR
    );
    assert.equal(read.items.some((item) => item.kind === "hotel"), false);
    const car = read.items.find((item) => item.kind === "car");
    assert.equal(car?.confirmation_ref, "81899756");
    assert.equal(car?.amount, 0);
    assert.equal(car?.details?.document_amount, 337.23);
    assert.equal(read.travelers[0]?.last_name, "Martin");
  });

  it("ne remplace pas les voyageurs déjà lus", () => {
    const read = readDepositServices(
      {
        items: [],
        travelers: [{ first_name: "Ada", last_name: "Lovelace" }],
      },
      TAAP_CAR
    );
    assert.equal(read.travelers[0]?.last_name, "Lovelace");
    assert.equal(read.items[0]?.kind, "car");
  });

  it("propose une dépense Pliant du même montant sans la prendre", () => {
    const proposals = matchPliantProposals(
      [337.23],
      [
        { id: "dep-1", amount: 120, label: "Taxi" },
        { id: "dep-2", amount: 337.23, label: "Europcar" },
      ]
    );
    assert.deepEqual(proposals, [{ id: "dep-2", montant: 337.23, libelle: "Europcar" }]);
    const step: PlannedStep = {
      action: "creer",
      carte_id: null,
      type: "car",
      titre: "Peugeot 3008 ou similaire",
      confirmation: "81899756",
      dates: "2027-04-04 → 2027-04-11",
      vol: null,
      trajet: null,
      prix_fournisseur: 337.23,
      prix_vente: 0,
      voyageurs: [],
      changements: [],
    };
    const message = cardsDepositMessage([step], proposals);
    assert.match(message, /Voiture créée, cachée, prix de vente 0 €/);
    assert.match(message, /coût 337,23 €/);
    assert.match(message, /n’est pas rattachée/);
    assert.match(message, /Aucun message/);
  });
});
