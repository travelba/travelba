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
  "scan_passeport",
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
  "creer_carte_pliant",
  "lire_carte_pliant",
  "bloquer_carte_pliant",
  "publier_carnet",
  "mettre_a_jour_dossier",
  "confirmer_service",
  "traiter_email",
  "creer_client",
  "mettre_a_jour_client",
  "ajouter_piece",
  "notifier_piece",
  "creer_dossier",
  "ajouter_voyageur",
  "retirer_voyageur",
  "fusionner_compagnon",
  "ajouter_vol",
  "modifier_vol",
  "retirer_carte",
  "ajouter_hotel",
  "ajouter_accueil_vip",
];

const WRITE_TOOLS = [
  "crediter_virement",
  "crediter_revolut",
  "rapprocher_depense_revolut",
  "crediter_stripe",
  "rapprocher_pliant",
  "creer_carte_pliant",
  "bloquer_carte_pliant",
  "publier_carnet",
  "mettre_a_jour_dossier",
  "confirmer_service",
  "traiter_email",
  "creer_client",
  "mettre_a_jour_client",
  "ajouter_piece",
  "notifier_piece",
  "creer_dossier",
  "ajouter_voyageur",
  "retirer_voyageur",
  "fusionner_compagnon",
  "ajouter_vol",
  "modifier_vol",
  "retirer_carte",
  "ajouter_hotel",
  "ajouter_accueil_vip",
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
  assert.deepEqual(
    MCP_TOOLS.filter((tool) => tool.signedUrl).map((tool) => tool.name),
    ["scan_passeport"]
  );
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "scan_passeport")?.pieceNumbers, undefined);
  assert.deepEqual(
    MCP_TOOLS.filter((tool) => tool.cardSecrets).map((tool) => tool.name),
    ["lire_carte_pliant"]
  );
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "creer_carte_pliant")?.cardSecrets, undefined);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "creer_carte_pliant")?.write, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "lire_carte_pliant")?.write, undefined);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "bloquer_carte_pliant")?.write, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "bloquer_carte_pliant")?.openWorld, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "bloquer_carte_pliant")?.cardSecrets, undefined);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "bloquer_carte_pliant")?.description || "", /debloquer/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "fiche_dossier")?.description || "", /carte_id/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "comptabilite_voyage")?.description || "", /carte_id/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "modifier_vol")?.description || "", /effacer_avertissement/);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "ajouter_piece")?.write, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "ajouter_piece")?.openWorld, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "ajouter_piece")?.pieceNumbers, undefined);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "notifier_piece")?.write, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "notifier_piece")?.openWorld, true);
  for (const name of ["creer_dossier", "ajouter_voyageur", "retirer_voyageur", "fusionner_compagnon", "ajouter_vol", "modifier_vol", "retirer_carte", "ajouter_hotel", "ajouter_accueil_vip"]) {
    const tool = MCP_TOOLS.find((item) => item.name === name);
    assert.equal(tool?.write, true);
    assert.equal(tool?.openWorld, undefined);
    assert.equal(tool?.pieceNumbers, undefined);
    assert.equal(tool?.signedUrl, undefined);
    assert.equal(tool?.cardSecrets, undefined);
  }
});

test("passport tools name the travelba-passeports namespace and stay off the general token", () => {
  for (const name of ["passeport_voyageur", "scan_passeport"]) {
    const description = MCP_TOOLS.find((tool) => tool.name === name)?.description || "";
    assert.match(description, /travelba-passeports/);
    assert.match(description, /jeton général/);
    assert.match(description, /voulu/);
  }
  const piece = MCP_TOOLS.find((tool) => tool.name === "ajouter_piece")?.description || "";
  assert.match(piece, /accompagnateur déjà lié/);
  assert.match(piece, /délivrance, autorité, noms/);
  assert.match(piece, /n’envoie rien/);
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

test("only scan_passeport keeps the signed file url", () => {
  const url = "https://example.supabase.co/storage/v1/object/sign/crm-files/a.jpg?token=abc";
  const payload = {
    url_signee: url,
    autre: url,
    numero_piece: "X12345678",
    storage_path: "customers/11111111-1111-4111-8111-111111111111/documents/a.jpg",
  };
  const scan = JSON.parse(previewMcpTool("scan_passeport", payload).content[0].text) as Record<string, unknown>;
  const passport = JSON.parse(previewMcpTool("passeport_voyageur", payload).content[0].text) as Record<string, unknown>;
  const fiche = JSON.parse(previewMcpTool("fiche_client", payload).content[0].text) as Record<string, unknown>;
  assert.equal(scan.url_signee, url);
  assert.equal(scan.autre, "retiré");
  assert.equal("numero_piece" in scan, false);
  assert.equal("storage_path" in scan, false);
  assert.equal(passport.url_signee, "retiré");
  assert.equal(passport.numero_piece, "X12345678");
  assert.equal("storage_path" in passport, false);
  assert.equal(fiche.url_signee, "retiré");
  assert.equal("numero_piece" in fiche, false);
});

test("only lire_carte_pliant keeps the card number", () => {
  const payload = {
    pan: "4242424242424242",
    cvv: "482",
    expiration: "06/28",
    titulaire: "Camille Martin",
    pliant_card_id: "card-1",
    numero_piece: "X12345678",
    note: "4242424242424242",
  };
  const card = JSON.parse(previewMcpTool("lire_carte_pliant", payload).content[0].text) as Record<string, unknown>;
  const created = JSON.parse(previewMcpTool("creer_carte_pliant", payload).content[0].text) as Record<string, unknown>;
  const fiche = JSON.parse(previewMcpTool("fiche_client", payload).content[0].text) as Record<string, unknown>;
  assert.equal(card.pan, "4242424242424242");
  assert.equal(card.cvv, "482");
  assert.equal(card.expiration, "06/28");
  assert.equal(card.titulaire, "Camille Martin");
  assert.equal("pliant_card_id" in card, false);
  assert.equal("numero_piece" in card, false);
  assert.equal("pan" in created, false);
  assert.equal("cvv" in created, false);
  assert.equal("expiration" in created, false);
  assert.equal(created.note, "•••");
  assert.equal("pan" in fiche, false);
  assert.equal(fiche.note, "•••");
  assert.equal(fiche.titulaire, "Camille Martin");
});
