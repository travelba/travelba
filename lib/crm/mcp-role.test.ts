import assert from "node:assert/strict";
import test from "node:test";
import { MCP_TOOLS } from "./mcp-registry";
import {
  MCP_ADMIN_DENIAL,
  MCP_PARTNER_DENIAL,
  MCP_ROLE_DENIAL,
  MCP_TOOL_GATES,
  mcpStaffDenial,
} from "./mcp-role";
import { permissionFlags } from "./agency-access";

test("chaque outil a un droit, les outils d’équipe sont administrateur", () => {
  for (const tool of MCP_TOOLS) {
    assert.ok(MCP_TOOL_GATES[tool.name], tool.name);
  }
  assert.equal(Object.keys(MCP_TOOL_GATES).length, MCP_TOOLS.length);
  for (const name of [
    "lister_membres",
    "ajouter_membre",
    "changer_role_membre",
    "desactiver_membre",
    "lister_cles_api",
    "creer_cle_api",
    "revoquer_cle_api",
    "supprimer_client",
    "supprimer_dossier",
    "supprimer_compagnon",
    "supprimer_piece_client",
    "regler_acces_hotels",
    "annoncer_option_hotel",
    "deposer_modeles_whatsapp",
    "statut_modeles_whatsapp",
    "deposer_modeles_autorisation_whatsapp",
    "statut_modeles_autorisation_whatsapp",
    "deposer_modeles_message_libre_whatsapp",
    "statut_modeles_message_libre_whatsapp",
    "reactiver_membre",
    "fusionner_clients",
    "completer_payeurs_stripe",
  ]) {
    assert.equal(MCP_TOOL_GATES[name], "admin");
    assert.match(MCP_TOOLS.find((tool) => tool.name === name)?.description || "", /administrateurs/);
  }
});

test("un agent est refusé sur l’équipe, un admin passe, le jeton général n’est pas filtré ici", () => {
  const agent = { role: "agent", allows: permissionFlags("agent", null) };
  const admin = { role: "admin", allows: permissionFlags("admin", null) };
  assert.equal(mcpStaffDenial("creer_cle_api", agent), MCP_ADMIN_DENIAL);
  assert.equal(mcpStaffDenial("lister_membres", agent), MCP_ADMIN_DENIAL);
  assert.equal(mcpStaffDenial("creer_cle_api", admin), null);
  assert.equal(mcpStaffDenial("fiche_dossier", agent), null);
  assert.equal(mcpStaffDenial("crediter_revolut", agent), null);
  assert.equal(mcpStaffDenial("crediter_revolut", { role: "lecture", allows: permissionFlags("lecture", null) }), MCP_ROLE_DENIAL);
  assert.equal(mcpStaffDenial("fiche_dossier", { role: "lecture", allows: permissionFlags("lecture", null) }), null);
  assert.equal(mcpStaffDenial("creer_dossier", { role: "partner" }), MCP_PARTNER_DENIAL);
  assert.equal(mcpStaffDenial("creer_cle_api", null), null);
  assert.equal(
    mcpStaffDenial("lister_cles_api", { role: "agent", allows: { ...permissionFlags("agent", null), manage_users: true } }),
    MCP_ADMIN_DENIAL
  );
});
