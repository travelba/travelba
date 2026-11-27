import assert from "node:assert/strict";
import test from "node:test";
import { enabledServiceKind, fulfilledTrainCard, insertionPlan, SERVICE_STEP_OPTIONS, serviceRequestCard, serviceRequestPrefill } from "./service-request";

const hotel = {
  id: "hotel",
  kind: "hotel",
  title: "Hôtel Lyon",
  city: "Lyon",
  start: "2026-06-01T15:00:00",
  end: "2026-06-02T11:00:00",
  sortOrder: 2,
};

test("le sélecteur d’étape active le train et laisse l’avion pour plus tard", () => {
  const train = SERVICE_STEP_OPTIONS.find((option) => option.kind === "train");
  const flight = SERVICE_STEP_OPTIONS.find((option) => option.kind === "flight");
  assert.equal(train?.label, "Train");
  assert.equal(train?.enabled, true);
  assert.equal(enabledServiceKind("train"), "train");
  assert.equal(flight?.label, "Avion");
  assert.equal(flight?.enabled, false);
  assert.equal(flight?.soon, "Bientôt");
  assert.equal(enabledServiceKind("flight"), null);
});

test("avant un hôtel, l’arrivée et le jour viennent de l’hôtel", () => {
  const filled = serviceRequestPrefill({ kind: "train", side: "avant", neighbor: hotel, homeCity: "Paris" });
  assert.equal(filled.depart, "Paris");
  assert.equal(filled.arrivee, "Lyon");
  assert.equal(filled.allerDate, "2026-06-01");
  assert.equal(filled.retourDate, "2026-06-02");
});

test("après un hôtel, le départ et le jour de départ viennent de l’hôtel", () => {
  const filled = serviceRequestPrefill({ kind: "train", side: "apres", neighbor: hotel, homeCity: "Paris" });
  assert.equal(filled.depart, "Lyon");
  assert.equal(filled.arrivee, "");
  assert.equal(filled.allerDate, "2026-06-02");
  assert.equal(filled.retourDate, "");
});

test("la carte s’insère avant ou après, puis devient le train au même rang", () => {
  const rows = [
    { id: "vol", sort_order: 1 },
    { id: "hotel", sort_order: 2 },
  ];
  const before = insertionPlan(rows, "hotel", "avant");
  assert.equal("error" in before ? "" : before.sortOrder, 2);
  const after = insertionPlan(rows, "hotel", "apres");
  assert.equal("error" in after ? "" : after.sortOrder, 3);
  const card = serviceRequestCard({
    kind: "train",
    depart: "Paris",
    arrivee: "Lyon",
    allerDate: "2026-06-01",
    sortOrder: 2,
    requestId: "demande",
  });
  assert.equal(card.title, "Demande de train");
  assert.equal(card.details.service_request, true);
  assert.equal(card.sort_order, 2);
  const bought = fulfilledTrainCard({
    depart: "Paris Gare de Lyon",
    arrivee: "Lyon Part-Dieu",
    date: "2026-06-01",
    heureDepart: "08:12",
    heureArrivee: "10:05",
    numero: "6601",
    reference: "SNCF1",
    prix: 120,
    classe: "1re",
    tarif: "flex",
    requestId: "demande",
    voyageurs: 1,
  });
  assert.equal(bought.kind, "rail");
  assert.equal(bought.details.service_request, false);
  assert.equal(bought.details.train_number, "6601");
  assert.equal(bought.details.client_hidden, true);
});
