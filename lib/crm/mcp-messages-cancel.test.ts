import assert from "node:assert/strict";
import test from "node:test";
import { parseProposal } from "./mcp-messages";

const ID = "11111111-1111-4111-8111-111111111111";

test("annuler vise une relance et n’envoie rien", () => {
  const parsed = parseProposal({ action: "annuler", id: ID });
  assert.equal(parsed.action, "annuler");
  assert.equal(parsed.id, ID);
});

test("annuler sans identifiant est refusé", () => {
  assert.throws(() => parseProposal({ action: "annuler", id: "x" }), /Relance manquante/);
});
