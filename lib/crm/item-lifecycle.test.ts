import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeCardDateRange,
  cancellationApplyPlan,
  cardStaysShown,
  inboxStayAction,
  replacementPlan,
} from "./item-lifecycle";

const hotel = (patch: Record<string, unknown> = {}) => ({
  id: "h1",
  kind: "hotel",
  title: "Hotel Eden",
  confirmation_ref: "97620170",
  amount: 1200,
  include_in_ledger: false,
  ...patch,
});

describe("replacementPlan", () => {
  it("met à jour la carte quand la référence est la même, et garde le prix pour la suite", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620170" }],
      [hotel()]
    );
    assert.deepEqual(plan.updates, [{ itemId: "h1" }]);
    assert.deepEqual(plan.replacements, []);
    assert.equal(plan.choices.length, 0);
  });

  it("remplace l’unique hôtel quand la référence change, au prix vendu", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620171" }],
      [hotel()]
    );
    assert.equal(plan.replacements.length, 1);
    assert.equal(plan.replacements[0].itemId, "h1");
    assert.equal(plan.replacements[0].amount, 1200);
  });

  it("demande la carte s’il y a deux hôtels", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Autre hôtel", confirmation_ref: "97620199" }],
      [hotel(), hotel({ id: "h2", title: "Second", confirmation_ref: "97620188", amount: 800 })]
    );
    assert.equal(plan.replacements.length, 0);
    assert.deepEqual(
      plan.choices.map((row) => row.id),
      ["h1", "h2"]
    );
    const chosen = replacementPlan(
      [{ kind: "hotel", title: "Autre hôtel", confirmation_ref: "97620199" }],
      [hotel(), hotel({ id: "h2", title: "Second", confirmation_ref: "97620188", amount: 800 })],
      "h2"
    );
    assert.equal(chosen.replacements[0].itemId, "h2");
    assert.equal(chosen.replacements[0].amount, 800);
  });

  it("met à jour la réservation Little Emperors et ajoute le trajet manquant", () => {
    const items = [
      hotel({ id: "milan", title: "Four Seasons Hotel Milan", confirmation_ref: "64570SH046795" }),
      hotel({
        id: "old",
        title: "Four Seasons Hotel Milano",
        confirmation_ref: "64570SH046734",
        lifecycle: "cancelled",
      }),
      hotel({ id: "rome", title: "Casa Monti", confirmation_ref: "45609SH011085" }),
      { id: "rail", kind: "rail", title: "Milano · Roma", confirmation_ref: "FEFZ75" },
    ];
    const incoming = [
      { kind: "hotel", title: "Hotel Milan", confirmation_ref: "64570SH046734" },
      { kind: "hotel", title: "Four Seasons Hotel Milan", confirmation_ref: "64570" },
      { kind: "hotel", title: "Hotel Rome", confirmation_ref: "45609SH010994" },
      { kind: "hotel", title: "Casa Monti", confirmation_ref: "45609" },
      { kind: "rail", title: "Milano · Roma", confirmation_ref: "FEFZ75" },
      { kind: "transfer", title: "Milan Rome", confirmation_ref: "TR-1" },
    ];
    const plan = replacementPlan(incoming, items);
    assert.deepEqual(
      plan.updates.map((row) => row.itemId).sort(),
      ["milan", "rail", "rome"]
    );
    assert.equal(plan.replacements.length, 0);
    assert.equal(plan.choices.length, 0);
    assert.equal(plan.adds, 1);
    const gesture = inboxStayAction({
      documentStatus: "confirmed",
      incoming,
      bookingStatus: "confirmed",
      items,
    });
    assert.equal(gesture.label, "Mettre à jour le séjour");
    assert.equal(gesture.action, "attach");
    assert.equal(gesture.choices.length, 0);
  });

  it("demande la chambre quand deux cartes actives partagent la réservation", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Four Seasons", confirmation_ref: "64570" }],
      [
        hotel({ id: "a", confirmation_ref: "64570SH046734" }),
        hotel({ id: "b", confirmation_ref: "64570SH046795" }),
      ]
    );
    assert.deepEqual(
      plan.choices.map((row) => row.id),
      ["a", "b"]
    );
  });

  it("ajoute plusieurs hôtels nouveaux sans demander une carte", () => {
    const plan = replacementPlan(
      [
        { kind: "hotel", title: "Un", confirmation_ref: "11111SH000001" },
        { kind: "hotel", title: "Deux", confirmation_ref: "22222SH000002" },
      ],
      [hotel(), hotel({ id: "h2", confirmation_ref: "97620188" })]
    );
    assert.equal(plan.choices.length, 0);
    assert.equal(plan.adds, 2);
    assert.equal(plan.replacements.length, 0);
  });

  it("recopie le prix d’une carte déjà annulée pour rouvrir le séjour", () => {
    const plan = replacementPlan(
      [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620173" }],
      [hotel({ lifecycle: "cancelled", amount: 1500 })]
    );
    assert.equal(plan.replacements[0].amount, 1500);
    const gesture = inboxStayAction({
      documentStatus: "confirmed",
      incoming: [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620173" }],
      bookingStatus: "cancelled",
      items: [hotel({ lifecycle: "cancelled", amount: 1500 })],
    });
    assert.equal(gesture.label, "Rouvrir et remplacer");
    assert.equal(gesture.action, "replace");
  });
});

describe("dates et visibilité", () => {
  it("cale les dates sur les cartes actives et garde une carte déjà montrée", () => {
    assert.deepEqual(
      activeCardDateRange([
        { kind: "hotel", lifecycle: "superseded", start_at: "2026-06-01", end_at: "2026-06-04" },
        { kind: "flight", start_at: "2026-06-12T08:00:00", end_at: "2026-06-12T10:00:00" },
        { kind: "hotel", start_at: "2026-06-13", end_at: "2026-06-16" },
      ]),
      { start: "2026-06-12", end: "2026-06-16" }
    );
    assert.equal(cardStaysShown({ visible_to_client: true }, true), true);
    assert.equal(cardStaysShown({ visible_to_client: true }, false), false);
    assert.equal(cardStaysShown(null, true), false);
  });
});

describe("annulation partielle", () => {
  it("retire l’hôtel et laisse le vol", () => {
    const plan = cancellationApplyPlan(
      { items: [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620170" }] },
      [hotel(), { id: "f1", kind: "flight", title: "Rome → Paris", confirmation_ref: "PNR1" }]
    );
    assert.deepEqual(plan.itemIds, ["h1"]);
    assert.equal(plan.cancelBooking, false);
  });

  it("annule le séjour s’il ne reste plus de carte", () => {
    const plan = cancellationApplyPlan(
      { items: [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620170" }] },
      [hotel()]
    );
    assert.equal(plan.cancelBooking, true);
  });

  it("nomme la carte qu’un mail d’annulation retirerait", () => {
    const gesture = inboxStayAction({
      documentStatus: "cancelled",
      incoming: [{ kind: "hotel", title: "Hotel Eden", confirmation_ref: "97620170" }],
      items: [hotel(), { id: "f1", kind: "flight", title: "Rome → Paris", confirmation_ref: "PNR1" }],
    });
    assert.equal(gesture.action, "cancel");
    assert.deepEqual(gesture.cancelCards, [{ id: "h1", title: "Hotel Eden" }]);
    assert.match(gesture.hint, /Hotel Eden/);
  });
});
