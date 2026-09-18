import assert from "node:assert/strict";
import test from "node:test";
import { revolutStatusLabel, revolutStatusTone, revolutSyncSummary } from "./revolut-labels";

test("revolut statuses are shown in French", () => {
  assert.equal(revolutStatusLabel("unmatched"), "À rapprocher");
  assert.equal(revolutStatusLabel("matched"), "Crédité");
  assert.equal(revolutStatusLabel("ignored"), "Ignoré");
  assert.equal(revolutStatusLabel("weird"), "weird");
  assert.equal(revolutStatusTone("unmatched"), "amber");
});

test("sync summary handles singular and plural", () => {
  assert.equal(revolutSyncSummary(1, 1), "Synchronisation terminée : 1 mouvement lu, 1 nouveau.");
  assert.equal(revolutSyncSummary(3, 0), "Synchronisation terminée : 3 mouvements lus, 0 nouveau.");
  assert.equal(revolutSyncSummary(4, 2), "Synchronisation terminée : 4 mouvements lus, 2 nouveaux.");
});
