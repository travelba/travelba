import assert from "node:assert/strict";
import test from "node:test";
import { possibleClientsLabel, revolutStatusLabel, revolutStatusTone, revolutSyncSummary } from "./revolut-labels";

test("revolut statuses are shown in French", () => {
  assert.equal(revolutStatusLabel("unmatched"), "À encaisser");
  assert.equal(revolutStatusLabel("matched"), "Encaissé");
  assert.equal(revolutStatusLabel("ignored"), "Refusé");
  assert.equal(revolutStatusLabel("weird"), "weird");
  assert.equal(revolutStatusTone("unmatched"), "amber");
});

test("sync summary handles singular and plural", () => {
  assert.equal(revolutSyncSummary(1, 1), "Synchronisation terminée : 1 mouvement lu, 1 nouveau.");
  assert.equal(revolutSyncSummary(3, 0), "Synchronisation terminée : 3 mouvements lus, 0 nouveau.");
  assert.equal(revolutSyncSummary(4, 2), "Synchronisation terminée : 4 mouvements lus, 2 nouveaux.");
});

test("libellé des candidats sans présélection", () => {
  assert.equal(possibleClientsLabel(1), "1 client possible — choisir");
  assert.equal(possibleClientsLabel(3), "3 clients possibles — choisir");
});
