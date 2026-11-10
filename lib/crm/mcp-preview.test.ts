import assert from "node:assert/strict";
import test from "node:test";
import { MCP_TOOLS } from "./mcp-registry";
import { holdUnlessConfirmed } from "./mcp-preview";
import { McpWriteError } from "./mcp-write";

const GATED = [
  "crediter_virement",
  "crediter_revolut",
  "crediter_stripe",
  "creer_carte_pliant",
  "publier_carnet",
  "inviter_client",
  "ajouter_piece",
  "notifier_piece",
  "notifier_carte_embarquement",
  "envoyer_releve",
  "preparer_facture_mb3m",
  "reprendre_facture_mb3m",
];

test("sans confirmer ces outils rendent un aperçu et n’écrivent pas", async () => {
  for (const name of GATED) {
    const tool = MCP_TOOLS.find((item) => item.name === name);
    assert.ok(tool, name);
    assert.match(tool.description, /Sans confirmer/);
    const result = (await tool.run({ client_id: "11111111-1111-4111-8111-111111111111", id: "11111111-1111-4111-8111-111111111111", montant: 10 })) as {
      apercu: boolean;
      ecrit: boolean;
      envoye: boolean;
      action: string;
    };
    assert.equal(result.apercu, true, name);
    assert.equal(result.ecrit, false, name);
    assert.equal(result.envoye, false, name);
    assert.equal(typeof result.action, "string", name);
  }
});

test("confirmer mal formé est refusé avant toute écriture", () => {
  assert.throws(() => holdUnlessConfirmed({ confirmer: "oui" }, { action: "test" }), McpWriteError);
  assert.equal(holdUnlessConfirmed({ confirmer: true }, { action: "test" }), null);
  const preview = holdUnlessConfirmed({}, { action: "test" });
  assert.equal(preview && preview.ecrit, false);
});
