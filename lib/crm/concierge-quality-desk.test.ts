import assert from "node:assert/strict";
import { test } from "node:test";
import {
  failedCriteria,
  groupQualityRuns,
  parisStamp,
  schemaMissesRelation,
  scoreRowsForStore,
  scrubQualityText,
  successRate,
  turnsForStore,
  type QualityRunRow,
} from "@/lib/crm/concierge-quality-desk";
import type { ConciergeScenario, SimRun } from "@/lib/crm/concierge-sim";

function run(partial: Partial<QualityRunRow> & Pick<QualityRunRow, "id" | "ok">): QualityRunRow {
  return {
    scenarioId: partial.id,
    slug: partial.slug || partial.id,
    title: partial.title || partial.id,
    phase: "sejour",
    mode: "router",
    startedAt: partial.startedAt || "2026-11-26T00:15:00.000Z",
    finishedAt: null,
    summary: partial.summary || "",
    batchId: partial.batchId ?? null,
    ...partial,
  };
}

test("le taux est entier, et zéro sans scénario", () => {
  assert.equal(successRate(3, 4), 75);
  assert.equal(successRate(0, 0), 0);
  assert.equal(successRate(1, 3), 33);
});

test("un lot regroupe les scénarios et nomme les échecs", () => {
  const batches = groupQualityRuns([
    run({ id: "a", ok: true, batchId: "lot", slug: "vol", title: "Vol", startedAt: "2026-11-26T00:15:00.000Z" }),
    run({
      id: "b",
      ok: false,
      batchId: "lot",
      slug: "retour",
      title: "Retour",
      summary: "1 interdit",
      startedAt: "2026-11-26T00:15:01.000Z",
    }),
    run({ id: "c", ok: true, batchId: null, slug: "seul", title: "Seul", startedAt: "2026-11-25T00:00:00.000Z" }),
  ]);
  assert.equal(batches[0]?.id, "lot");
  assert.equal(batches[0]?.total, 2);
  assert.equal(batches[0]?.passed, 1);
  assert.equal(batches[0]?.rate, 50);
  assert.deepEqual(batches[0]?.failed, [{ slug: "retour", title: "Retour", summary: "1 interdit" }]);
  assert.equal(batches[1]?.id, "c");
  assert.equal(batches[1]?.rate, 100);
});

test("l’heure affichée est celle de Paris", () => {
  const label = parisStamp("2026-11-26T00:15:00.000Z");
  assert.match(label, /26/);
  assert.match(label, /2026/);
  assert.match(label, /01:15/);
});

test("le texte gardé n’a ni MRZ, ni prix net, ni date de naissance", () => {
  const cleaned = scrubQualityText(
    "Vol AF1205.\nP<FRAExemple<<<<<<<<<<<<<<<<<<<<<<<<\nNé le 12/03/1990. Le prix net du fournisseur est secret. Commission 10 %."
  );
  assert.equal(/P<FRA|MRZ|prix net|fournisseur|commission|12\/03\/1990/i.test(cleaned), false);
  assert.match(cleaned, /AF1205/);
});

test("un tour stocké ne reprend pas le texte interdit", () => {
  const scenario = {
    slug: "essai",
    phase: "sejour",
    title: "Essai",
    locale: "fr",
    published: true,
    fixture: { firstName: "Camille", preferences: [], language: "fr", stays: [], documents: [], movements: [], balances: [] },
    turns: [{ position: 1, clientText: "Né le 01.02.1980", expect: { handoff: null } }],
  } as ConciergeScenario;
  const sim: SimRun = {
    slug: "essai",
    phase: "sejour",
    mode: "router",
    ok: false,
    summary: "echec",
    turns: [
      {
        position: 1,
        status: "graded",
        reply: "Le prix net est caché.",
        handoff: null,
        tools: [],
        scores: [{ criterion: "interdit", ok: false, detail: "mot interdit" }],
      },
    ],
  };
  const stored = turnsForStore(scenario, sim);
  assert.equal(stored[0]?.client.includes("1980"), false);
  assert.equal(/prix net/i.test(stored[0]?.reply || ""), false);
  assert.deepEqual(stored[0]?.failed, ["interdit"]);
  const scores = scoreRowsForStore("run-1", sim);
  assert.equal(scores[0]?.detail, "mot interdit");
  assert.equal(scores[0]?.ok, false);
  assert.deepEqual(failedCriteria(scores.map((row) => ({ ...row, runId: row.run_id }))), ["interdit"]);
});

test("une table absente se reconnaît", () => {
  assert.equal(schemaMissesRelation({ code: "PGRST205", message: "Could not find the table public.crm_concierge_scenarios in the schema cache" }), true);
  assert.equal(schemaMissesRelation({ code: "23505", message: "duplicate key" }), false);
  assert.equal(schemaMissesRelation(null), false);
});
