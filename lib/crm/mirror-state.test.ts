import assert from "node:assert/strict";
import test from "node:test";
import { mirrorStep } from "./mirror-state";

test("un champ intact suit le serveur, un champ touché garde la saisie", () => {
  // Rien n’a bougé côté serveur : rien ne change.
  assert.deepEqual(mirrorStep("a", "a", "a"), { seen: "a", draft: "a" });
  assert.deepEqual(mirrorStep("a", "a", "tapé"), { seen: "a", draft: "tapé" });
  // Le serveur change et l’agent n’a pas touché : le brouillon suit.
  assert.deepEqual(mirrorStep("b", "a", "a"), { seen: "b", draft: "b" });
  // Le serveur change pendant que l’agent tape : sa saisie gagne, mais on note la nouvelle valeur vue.
  assert.deepEqual(mirrorStep("b", "a", "tapé"), { seen: "b", draft: "tapé" });
  // Après enregistrement, le serveur renvoie exactement la saisie : plus de différence.
  assert.deepEqual(mirrorStep("tapé", "a", "tapé"), { seen: "tapé", draft: "tapé" });
});

test("les objets se comparent par identité : un refresh remplace un choix intact, pas un choix fait", () => {
  const serverA = { id: "c1" };
  const serverA2 = { id: "c1" };
  const picked = { id: "c2" };
  assert.deepEqual(mirrorStep(serverA2, serverA, serverA), { seen: serverA2, draft: serverA2 });
  assert.deepEqual(mirrorStep(serverA2, serverA, picked), { seen: serverA2, draft: picked });
  assert.deepEqual(mirrorStep(null, serverA, serverA), { seen: null, draft: null });
});
