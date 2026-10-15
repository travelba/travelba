import assert from "node:assert/strict";
import test from "node:test";
import { MCP_TOOL_CAP, MCP_TOOLS, previewMcpTool } from "./mcp-registry";

const EXPECTED = [
  "tableau_de_bord",
  "chercher_clients",
  "fiche_client",
  "chercher_dossiers",
  "fiche_dossier",
  "passeport_voyageur",
  "formalites",
  "services_a_confirmer",
  "grand_livre",
  "revolut_en_attente",
  "revolut_debits",
  "comptabilite_voyage",
  "stripe_en_attente",
  "emails_en_attente",
  "little_emperors_en_attente",
  "crediter_virement",
  "crediter_revolut",
  "rapprocher_depense_revolut",
  "crediter_stripe",
  "rapprocher_pliant",
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
  "rapprocher_depense_revolut",
  "crediter_stripe",
  "rapprocher_pliant",
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
  assert.deepEqual(
    MCP_TOOLS.filter((tool) => tool.pieceNumbers).map((tool) => tool.name),
    ["passeport_voyageur"]
  );
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "passeport_voyageur")?.write, undefined);
});

test("only passeport_voyageur keeps a piece number in the payload", () => {
  const payload = { numero: "FAC-1", numero_piece: "X12345678", number: "12AB34567" };
  const passport = JSON.parse(previewMcpTool("passeport_voyageur", payload).content[0].text) as Record<string, unknown>;
  const fiche = JSON.parse(previewMcpTool("fiche_client", payload).content[0].text) as Record<string, unknown>;
  assert.equal(passport.numero_piece, "X12345678");
  assert.equal(passport.numero, "FAC-1");
  assert.equal("number" in passport, false);
  assert.equal("numero_piece" in fiche, false);
  assert.equal("number" in fiche, false);
  assert.equal(fiche.numero, "FAC-1");
});
