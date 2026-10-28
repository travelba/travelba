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
  "lire_email",
  "reservation_little_emperors",
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
  "modifier_titulaire",
  "definir_role_societe",
  "inviter_client",
  "ajouter_piece",
  "requalifier_piece",
  "notifier_piece",
  "notifier_carte_embarquement",
  "creer_dossier",
  "ajouter_voyageur",
  "modifier_voyageur",
  "retirer_voyageur",
  "fusionner_compagnon",
  "ajouter_vol",
  "modifier_vol",
  "retirer_carte",
  "definir_visibilite_carte",
  "preparer_message_carnet",
  "ajouter_hotel",
  "modifier_hotel",
  "ajouter_accueil_vip",
  "enregistrement_en_ligne",
  "envoyer_releve",
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
  "modifier_titulaire",
  "definir_role_societe",
  "inviter_client",
  "ajouter_piece",
  "requalifier_piece",
  "notifier_piece",
  "notifier_carte_embarquement",
  "creer_dossier",
  "ajouter_voyageur",
  "modifier_voyageur",
  "retirer_voyageur",
  "fusionner_compagnon",
  "ajouter_vol",
  "modifier_vol",
  "retirer_carte",
  "definir_visibilite_carte",
  "preparer_message_carnet",
  "ajouter_hotel",
  "modifier_hotel",
  "ajouter_accueil_vip",
  "enregistrement_en_ligne",
  "envoyer_releve",
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
  assert.match(MCP_TOOLS.find((tool) => tool.name === "creer_carte_pliant")?.description || "", /transactions/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "creer_carte_pliant")?.description || "", /plafond total/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "creer_carte_pliant")?.description || "", /chaque débit/i);
  assert.doesNotMatch(MCP_TOOLS.find((tool) => tool.name === "creer_carte_pliant")?.description || "", /ignoré/);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "lire_carte_pliant")?.write, undefined);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "bloquer_carte_pliant")?.write, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "bloquer_carte_pliant")?.openWorld, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "bloquer_carte_pliant")?.cardSecrets, undefined);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "bloquer_carte_pliant")?.description || "", /debloquer/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "fiche_dossier")?.description || "", /carte_id/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "fiche_dossier")?.description || "", /voyageur_id/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "modifier_vol")?.description || "", /voyageur_ids/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "comptabilite_voyage")?.description || "", /carte_id/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "modifier_vol")?.description || "", /effacer_avertissement/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "ajouter_voyageur")?.description || "", /date de naissance/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "ajouter_voyageur")?.description || "", /compagnon_id/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "modifier_voyageur")?.description || "", /voyageur_id/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "modifier_voyageur")?.description || "", /passeport/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "mettre_a_jour_dossier")?.description || "", /societe_id/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "mettre_a_jour_dossier")?.description || "", /titre/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "mettre_a_jour_dossier")?.description || "", /couverture/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "creer_dossier")?.description || "", /sans titre/i);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "mettre_a_jour_client")?.description || "", /supprimer_societe_id/);
  const titulaire = MCP_TOOLS.find((tool) => tool.name === "modifier_titulaire");
  assert.equal(titulaire?.write, true);
  assert.equal(titulaire?.openWorld, undefined);
  assert.equal(titulaire?.pieceNumbers, undefined);
  assert.match(titulaire?.description || "", /nom de passeport/);
  assert.match(titulaire?.description || "", /adresse personnelle/);
  assert.match(titulaire?.description || "", /n’est ni lu ni renvoyé/);
  assert.match(titulaire?.description || "", /pays_passeport/);
  const role = MCP_TOOLS.find((tool) => tool.name === "definir_role_societe");
  assert.equal(role?.write, true);
  assert.equal(role?.openWorld, undefined);
  assert.match(role?.description || "", /admin/);
  assert.match(role?.description || "", /membre/);
  assert.match(role?.description || "", /particulier/);
  const invite = MCP_TOOLS.find((tool) => tool.name === "inviter_client");
  assert.equal(invite?.write, true);
  assert.equal(invite?.openWorld, true);
  assert.equal(invite?.pieceNumbers, undefined);
  assert.equal(invite?.signedUrl, undefined);
  assert.match(invite?.description || "", /même flux/);
  assert.match(invite?.description || "", /n’est pas renvoyé/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "modifier_hotel")?.description || "", /prix de vente/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "modifier_hotel")?.description || "", /MAD/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "reservation_little_emperors")?.description || "", /déjà rattachée/);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "reservation_little_emperors")?.write, undefined);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "ajouter_piece")?.write, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "ajouter_piece")?.openWorld, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "ajouter_piece")?.pieceNumbers, undefined);
  const requalifier = MCP_TOOLS.find((tool) => tool.name === "requalifier_piece");
  assert.equal(requalifier?.write, true);
  assert.equal(requalifier?.openWorld, undefined);
  assert.equal(requalifier?.pieceNumbers, undefined);
  assert.equal(requalifier?.signedUrl, undefined);
  assert.match(requalifier?.description || "", /document_id/);
  assert.match(requalifier?.description || "", /carte d’embarquement/);
  assert.match(requalifier?.description || "", /n’est pas recopié/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "ajouter_piece")?.description || "", /carte_embarquement/);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "notifier_piece")?.write, true);
  assert.equal(MCP_TOOLS.find((tool) => tool.name === "notifier_piece")?.openWorld, true);
  const carte = MCP_TOOLS.find((tool) => tool.name === "notifier_carte_embarquement");
  assert.equal(carte?.write, true);
  assert.equal(carte?.openWorld, true);
  assert.equal(carte?.pieceNumbers, undefined);
  assert.equal(carte?.signedUrl, undefined);
  assert.match(carte?.description || "", /document_id/);
  assert.match(carte?.description || "", /ne repart pas/);
  assert.match(carte?.description || "", /approuvé/);
  assert.match(carte?.description || "", /passagers/);
  assert.match(carte?.description || "", /Rien n’est inventé/);
  const visibilite = MCP_TOOLS.find((tool) => tool.name === "definir_visibilite_carte");
  assert.equal(visibilite?.write, true);
  assert.equal(visibilite?.openWorld, undefined);
  assert.equal(visibilite?.pieceNumbers, undefined);
  assert.equal(visibilite?.signedUrl, undefined);
  assert.equal(visibilite?.cardSecrets, undefined);
  assert.match(visibilite?.description || "", /n’envoie rien/);
  assert.match(visibilite?.description || "", /un clic/);
  assert.match(visibilite?.description || "", /WhatsApp/);
  assert.match(visibilite?.description || "", /inclure_transactions/);
  assert.match(visibilite?.description || "", /total exact/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "modifier_vol")?.description || "", /au centime/);
  const message = MCP_TOOLS.find((tool) => tool.name === "preparer_message_carnet");
  assert.equal(message?.write, true);
  assert.equal(message?.openWorld, undefined);
  assert.equal(message?.pieceNumbers, undefined);
  assert.equal(message?.signedUrl, undefined);
  assert.equal(message?.cardSecrets, undefined);
  assert.match(message?.description || "", /Rien n’est envoyé/);
  assert.match(message?.description || "", /un clic/);
  assert.match(message?.description || "", /fournisseur/);
  for (const name of ["creer_dossier", "ajouter_voyageur", "modifier_voyageur", "retirer_voyageur", "fusionner_compagnon", "ajouter_vol", "modifier_vol", "retirer_carte", "definir_visibilite_carte", "preparer_message_carnet", "ajouter_hotel", "modifier_hotel", "ajouter_accueil_vip", "enregistrement_en_ligne"]) {
    const tool = MCP_TOOLS.find((item) => item.name === name);
    assert.equal(tool?.write, true);
    assert.equal(tool?.openWorld, undefined);
    assert.equal(tool?.pieceNumbers, undefined);
    assert.equal(tool?.signedUrl, undefined);
    assert.equal(tool?.cardSecrets, undefined);
  }
  const checkinTool = MCP_TOOLS.find((tool) => tool.name === "enregistrement_en_ligne");
  assert.match(checkinTool?.description || "", /Pas de passeport, pas de MRZ/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "fiche_dossier")?.description || "", /enregistrement/);
  assert.match(MCP_TOOLS.find((tool) => tool.name === "fiche_dossier")?.description || "", /modifier_voyageur/);
  const releve = MCP_TOOLS.find((tool) => tool.name === "envoyer_releve");
  assert.equal(releve?.write, true);
  assert.equal(releve?.openWorld, true);
  assert.equal(releve?.pieceNumbers, undefined);
  assert.equal(releve?.signedUrl, undefined);
  assert.equal(releve?.cardSecrets, undefined);
  assert.match(releve?.description || "", /TWILIO_CONTENT_RELEVE/);
  assert.match(releve?.description || "", /cinq minutes/);
  assert.match(releve?.description || "", /force/);
  assert.match(releve?.description || "", /twilio_sid/);
  assert.match(releve?.description || "", /e-mail n’est pas ouvert/);
  const lecture = MCP_TOOLS.find((tool) => tool.name === "lire_email");
  assert.equal(lecture?.write, undefined);
  assert.equal(lecture?.pieceNumbers, undefined);
  assert.equal(lecture?.signedUrl, undefined);
  assert.equal(lecture?.cardSecrets, undefined);
  assert.match(lecture?.description || "", /PDF/);
  assert.match(lecture?.description || "", /passeport/);
  assert.match(lecture?.description || "", /PNR/);
  const mail = MCP_TOOLS.find((tool) => tool.name === "traiter_email");
  assert.match(mail?.description || "", /creer_dossier/);
  assert.match(mail?.description || "", /Aucune carte n’est créée ni modifiée/);
  assert.match(mail?.description || "", /sans e-mail/);
  assert.match(mail?.description || "", /Aucune invitation/);
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
