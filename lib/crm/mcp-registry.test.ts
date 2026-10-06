import assert from "node:assert/strict";
import test from "node:test";
import { MCP_TOOL_CAP, MCP_TOOLS } from "./mcp-registry";

const EXPECTED = [
  "tableau_de_bord",
  "chercher_clients",
  "fiche_client",
  "chercher_dossiers",
  "fiche_dossier",
  "formalites",
  "services_a_confirmer",
  "grand_livre",
  "revolut_en_attente",
  "stripe_en_attente",
  "emails_en_attente",
  "little_emperors_en_attente",
  "crediter_virement",
  "crediter_revolut",
  "crediter_stripe",
  "publier_carnet",
  "mettre_a_jour_dossier",
  "confirmer_service",
  "traiter_email",
  "creer_client",
  "mettre_a_jour_client",
];

const WRITE_TOOLS = [
  "crediter_virement",
  "crediter_revolut",
  "crediter_stripe",
  "publier_carnet",
  "mettre_a_jour_dossier",
  "confirmer_service",
  "traiter_email",
  "creer_client",
  "mettre_a_jour_client",
];

test("mcp tools stay unique, named, and under the cap", () => {
  const names = MCP_TOOLS.map((tool) => tool.name);
  assert.deepEqual(names, EXPECTED);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length <= MCP_TOOL_CAP);
  for (const tool of MCP_TOOLS) {
    assert.ok(tool.description.length > 20);
  }
  assert.deepEqual(
    MCP_TOOLS.filter((tool) => tool.write).map((tool) => tool.name),
    WRITE_TOOLS
  );
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "confirmer_service")?.openWorld, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "grand_livre")?.write, undefined);
});
