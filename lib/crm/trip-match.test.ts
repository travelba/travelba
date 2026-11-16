import assert from "node:assert/strict";
import test from "node:test";
import { DIFFERENT_CLIENT_HOLD, reunionPlan, type TripDossier } from "./trip-match";

function dossier(partial: Partial<TripDossier> & Pick<TripDossier, "id" | "customerId">): TripDossier {
  return {
    reference: partial.id,
    start: "2026-06-01",
    end: "2026-06-08",
    places: ["Tel Aviv"],
    people: [{ first_name: "Amin", last_name: "Khiari" }],
    ...partial,
  };
}

const incoming = dossier({
  id: "incoming",
  customerId: "khiari",
  start: "2026-01-01",
  end: "2026-01-03",
  people: [{ first_name: "Amin", last_name: "Khiari" }],
});

test("le dossier qui touche le mail est gardé, celui qui ne touche qu’un voisin ne l’est pas", () => {
  const near = dossier({ id: "near", customerId: "khiari", start: "2026-01-01", end: "2026-01-20" });
  const later = dossier({
    id: "later",
    customerId: "khiari",
    start: "2026-02-05",
    end: "2026-02-10",
    places: ["Tel Aviv"],
  });
  const plan = reunionPlan(incoming, [near, later]);
  assert.equal(plan.keeper?.id, "near");
  assert.deepEqual(plan.mergeIds, []);
  assert.equal(plan.hold, null);
});

test("un autre client au nom proche n’est pas fusionné", () => {
  const own = dossier({ id: "own", customerId: "khiari", start: "2026-01-01", end: "2026-01-04" });
  const other = dossier({
    id: "other",
    customerId: "bettane",
    start: "2026-01-02",
    end: "2026-01-06",
    people: [{ first_name: "Amin", last_name: "Khiari" }],
    reference: "TB-2026-0200",
  });
  const chained = dossier({
    id: "chained",
    customerId: "bettane",
    start: "2026-02-01",
    end: "2026-02-08",
    people: [{ first_name: "Marc", last_name: "Bettane" }],
  });
  const plan = reunionPlan(incoming, [own, other, chained]);
  assert.equal(plan.keeper?.id, "own");
  assert.deepEqual(plan.mergeIds, []);
  assert.deepEqual(plan.proposals.map((row) => row.id), ["other"]);
});

test("sans dossier du même client, l’autre client reste en attente", () => {
  const other = dossier({
    id: "other",
    customerId: "bettane",
    start: "2026-01-02",
    end: "2026-01-06",
    people: [{ first_name: "Amin", last_name: "Khiari" }],
  });
  const plan = reunionPlan(incoming, [other]);
  assert.equal(plan.keeper, null);
  assert.deepEqual(plan.mergeIds, []);
  assert.equal(plan.hold, DIFFERENT_CLIENT_HOLD);
});

test("un dossier créé pendant le passage n’est pas absorbé", () => {
  const older = dossier({
    id: "older",
    customerId: "khiari",
    start: "2026-01-01",
    end: "2026-01-04",
    createdAt: "2026-11-01T00:00:00.000Z",
  });
  const fresh = dossier({
    id: "fresh",
    customerId: "khiari",
    start: "2026-01-01",
    end: "2026-01-04",
    createdAt: "2026-11-14T10:05:00.000Z",
  });
  const plan = reunionPlan(incoming, [older, fresh], {
    bornIds: new Set(["fresh"]),
    passStartedAt: "2026-11-14T10:00:00.000Z",
  });
  assert.equal(plan.keeper?.id, "older");
  assert.deepEqual(plan.mergeIds, []);
});
