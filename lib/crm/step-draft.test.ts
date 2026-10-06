import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDraftStepId, stepCommitPlan, type StepSnapshot } from "./step-draft";

function step(patch: Partial<StepSnapshot> & Pick<StepSnapshot, "id">): StepSnapshot {
  return {
    kind: "hotel",
    title: "Casa Monti",
    supplier: "Little Emperors",
    confirmation_ref: "36441",
    start_at: "2026-12-08",
    end_at: "2026-12-13",
    amount: 6790,
    include_in_ledger: true,
    visible_to_client: true,
    details: { city: "Rome" },
    ...patch,
  };
}

describe("étape en attente d’enregistrement", () => {
  it("ne prévoit rien tant que la liste n’a pas changé", () => {
    const hotel = step({ id: "a" });
    const plan = stepCommitPlan([hotel], [hotel]);
    assert.equal(plan.pending, false);
    assert.deepEqual(plan.deleted, []);
    assert.deepEqual(plan.updated, []);
    assert.deepEqual(plan.created, []);
    assert.deepEqual(plan.order, []);
  });

  it("retire une étape seulement dans le plan, pas toute seule", () => {
    const plan = stepCommitPlan([step({ id: "a" }), step({ id: "b", title: "Milan" })], [step({ id: "b", title: "Milan" })]);
    assert.equal(plan.pending, true);
    assert.deepEqual(plan.deleted, ["a"]);
    assert.deepEqual(plan.order, ["b"]);
  });

  it("garde une modification de titre jusqu’à l’enregistrement", () => {
    const plan = stepCommitPlan([step({ id: "a" })], [step({ id: "a", title: "Casa Monti suite" })]);
    assert.equal(plan.updated.length, 1);
    assert.equal(plan.updated[0]?.title, "Casa Monti suite");
    assert.deepEqual(plan.order, []);
  });

  it("ne renvoie pas une étape modifiée puis retirée", () => {
    const plan = stepCommitPlan(
      [step({ id: "a" }), step({ id: "b" })],
      [step({ id: "b", title: "Autre" })]
    );
    assert.deepEqual(plan.deleted, ["a"]);
    assert.equal(plan.updated.length, 1);
    assert.equal(plan.updated[0]?.id, "b");
  });

  it("ajoute une étape brouillon sans l’écrire", () => {
    const created = step({ id: "draft:1", title: "Nouveau" });
    const plan = stepCommitPlan([step({ id: "a" })], [step({ id: "a" }), created]);
    assert.equal(isDraftStepId(created.id), true);
    assert.equal(plan.created.length, 1);
    assert.deepEqual(plan.order, ["a", "draft:1"]);
  });

  it("n’ajoute pas deux fois un brouillon déjà pris en compte", () => {
    const created = step({ id: "draft:1", title: "Nouveau" });
    const plan = stepCommitPlan([step({ id: "a" }), created], [step({ id: "a" }), created]);
    assert.equal(plan.pending, false);
    assert.equal(plan.created.length, 0);
  });

  it("oublie une étape brouillon retirée avant l’enregistrement", () => {
    const plan = stepCommitPlan([step({ id: "a" })], [step({ id: "a" })]);
    assert.equal(plan.pending, false);
  });

  it("retient un changement d’ordre", () => {
    const plan = stepCommitPlan(
      [step({ id: "a" }), step({ id: "b" })],
      [step({ id: "b" }), step({ id: "a" })]
    );
    assert.deepEqual(plan.deleted, []);
    assert.deepEqual(plan.order, ["b", "a"]);
  });
});
