import assert from "node:assert/strict";
import test from "node:test";
import { staffResetDecision } from "./staff-reset";

test("le mot de passe oublié de l’équipe ne part pas sans fiche collègue", () => {
  assert.equal(staffResetDecision({ userId: null, staffId: null }), "silent");
  assert.equal(staffResetDecision({ userId: "auth-1", staffId: null }), "silent");
  assert.equal(staffResetDecision({ userId: "auth-1", staffId: "staff-1" }), "send");
});
