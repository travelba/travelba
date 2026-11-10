import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planEmailSteps, type StepCard } from "./email-step-plan";

const PASSENGERS = [
  { first_name: "Camille", last_name: "Martin" },
  { first_name: "Louis", last_name: "Martin" },
  { first_name: "Alice", last_name: "Martin" },
  { first_name: "Hugo", last_name: "Martin" },
  { first_name: "Léa", last_name: "Martin" },
];

function flight(partial: Partial<StepCard> & { id: string }): StepCard {
  return {
    kind: "flight",
    title: "Vol",
    confirmation_ref: null,
    start_at: null,
    end_at: null,
    supplier: null,
    amount: null,
    lifecycle: "active",
    details: {},
    ...partial,
  };
}

describe("mise à jour des étapes depuis un mail", () => {
  it("remplit l’étape vide Transavia et garde l’aller-retour NHN3QN en une carte", () => {
    const blank = flight({
      id: "vide",
      title: "Tel Aviv",
      start_at: "2026-04-02",
      end_at: "2026-04-09",
      amount: null,
      details: { to: "TLV", city_to: "Tel Aviv" },
    });
    const preview = planEmailSteps([blank], {
      travelers: PASSENGERS,
      items: [
        {
          kind: "flight",
          title: "Paris → Tel Aviv",
          supplier: "Transavia",
          confirmation_ref: "NHN3QN",
          start_at: "2026-04-02T06:30:00",
          end_at: "2026-04-02T11:40:00",
          amount: 890,
          details: {
            pnr: "NHN3QN",
            flight_number: "TO3458",
            from: "ORY",
            to: "TLV",
            airline: "Transavia",
            document_amount: 890,
          },
        },
        {
          kind: "flight",
          title: "Tel Aviv → Paris",
          supplier: "Transavia",
          confirmation_ref: "NHN3QN",
          start_at: "2026-04-09T12:15:00",
          end_at: "2026-04-09T16:40:00",
          amount: 890,
          details: {
            pnr: "NHN3QN",
            flight_number: "TO3451",
            from: "TLV",
            to: "ORY",
            airline: "Transavia",
            document_amount: 890,
          },
        },
      ],
    });

    assert.equal(preview.etapes.length, 2);
    assert.equal(preview.etapes[0]?.action, "completer");
    assert.equal(preview.etapes[0]?.carte_id, "vide");
    assert.equal(preview.etapes[0]?.confirmation, "NHN3QN");
    assert.equal(preview.etapes[0]?.vol, "TO3458");
    assert.equal(preview.etapes[0]?.trajet, "ORY → TLV");
    assert.equal(preview.etapes[0]?.prix_fournisseur, 890);
    assert.equal(preview.etapes[0]?.prix_vente, 0);
    assert.equal(preview.etapes[0]?.changements.some((row) => row.champ === "prix"), false);
    assert.equal(preview.etapes[0]?.voyageurs.length, 5);
    assert.equal(preview.etapes[1]?.action, "creer");
    assert.equal(preview.etapes[1]?.vol, "TO3451");
    assert.equal(preview.etapes[1]?.prix_vente, 0);
    assert.equal(preview.aller_retour.length, 1);
    assert.equal(preview.aller_retour[0]?.pnr, "NHN3QN");
    assert.deepEqual(preview.aller_retour[0]?.lignes, ["Paris → Tel Aviv", "Tel Aviv → Paris"]);
  });

  it("montre un champ déjà rempli qui diffère, et ne remplit pas un vol qui a déjà un numéro", () => {
    const named = flight({
      id: "af",
      title: "Paris → Rome",
      confirmation_ref: null,
      start_at: "2026-04-02T08:00:00",
      end_at: "2026-04-02T10:00:00",
      supplier: "Air France",
      amount: 400,
      details: { flight_number: "AF1204", from: "CDG", to: "FCO", airline: "Air France" },
    });
    const preview = planEmailSteps([named], {
      travelers: [{ first_name: "Camille", last_name: "Martin" }],
      items: [
        {
          kind: "flight",
          title: "Paris → Tel Aviv",
          supplier: "Transavia",
          confirmation_ref: "NHN3QN",
          start_at: "2026-04-02T06:30:00",
          details: { flight_number: "TO3458", from: "ORY", to: "TLV", airline: "Transavia", document_amount: 200 },
        },
      ],
    });
    assert.equal(preview.etapes.length, 1);
    assert.equal(preview.etapes[0]?.action, "creer");
    assert.equal(preview.etapes[0]?.carte_id, null);
    assert.equal(preview.etapes[0]?.prix_vente, 0);

    const sameDayBlank = flight({
      id: "vide",
      title: "Paris → Rome",
      start_at: "2026-05-01T09:00:00",
      supplier: "Air France",
      amount: 400,
      details: { from: "CDG", to: "FCO" },
    });
    const filled = planEmailSteps([sameDayBlank], {
      travelers: [],
      items: [
        {
          kind: "flight",
          title: "Paris → Tel Aviv",
          supplier: "Transavia",
          confirmation_ref: "NHN3QN",
          start_at: "2026-05-01T06:30:00",
          details: { flight_number: "TO3458", from: "ORY", to: "TLV", airline: "Transavia" },
        },
      ],
    });
    assert.equal(filled.etapes[0]?.action, "completer");
    assert.equal(filled.etapes[0]?.carte_id, "vide");
    assert.equal(filled.etapes[0]?.prix_vente, 400);
    const title = filled.etapes[0]?.changements.find((row) => row.champ === "titre");
    assert.equal(title?.avant, "Paris → Rome");
    assert.equal(title?.apres, "Paris → Tel Aviv");
    assert.equal(filled.etapes[0]?.changements.some((row) => row.champ === "prix"), false);
  });
});
