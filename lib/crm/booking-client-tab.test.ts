import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("l’onglet Client d’un dossier résume la fiche, sans l’éditer", () => {
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  const change = readFileSync(join(root, "components/admin/ChangeBookingClient.tsx"), "utf8");
  const page = readFileSync(join(root, "app/admin/reservations/[id]/page.tsx"), "utf8");
  const load = readFileSync(join(root, "lib/crm/admin-booking-load.ts"), "utf8");
  assert.equal(editor.includes("<CustomerEditor"), false, "la fiche complète se modifie sur /admin/clients/[id]");
  assert.match(editor, /Ouvrir la fiche/);
  assert.match(editor, /Identité, coordonnées, passeports et sociétés se modifient sur la fiche client/);
  assert.equal(editor.includes('name="customer_id"'), false);
  assert.match(editor, /<ChangeBookingClient/);
  assert.match(change, /Changer de client/);
  assert.match(change, /C’est un autre client/);
  assert.match(change, /Créer un nouveau client/);
  assert.match(change, /Aucune invitation/);
  assert.match(change, /Créer et rattacher/);
  assert.match(editor, /Sur ce séjour/);
  assert.match(editor, /<TripSharePanel/);
  assert.match(editor, /<CustomerLoginLog/);
  assert.match(page, /\{\.\.\.shell\.value\}/);
  assert.match(load, /ficheBillingCompanies:/);
  assert.equal(page.includes("companyAdmins"), false);
  assert.equal(load.includes("companyAdmins"), false);
  assert.equal(page.includes('eq("company_role", "admin")'), false);
  assert.equal(load.includes('eq("company_role", "admin")'), false);
});

test("le fil WhatsApp vit dans l’onglet Client", () => {
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  const client = editor.slice(editor.indexOf('{tab === "client" ? ('), editor.indexOf('{tab === "argent" ? ('));
  assert.match(client, /<WhatsappThread/);
  assert.equal(editor.includes('tab === "whatsapp"'), false);
  assert.equal(editor.includes('tab === "interface"'), false);
  assert.equal(editor.includes("Aperçu de l’espace client"), false);
  assert.match(editor, /Voir comme le client/);
});

test("la barre du dossier n’a qu’un geste, le menu tient le reste", () => {
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  const primary = editor.slice(editor.indexOf("const stayAction = clientStayAction(booking)"), editor.indexOf("const moreButton ="));
  const menu = editor.slice(editor.indexOf("const moreMenu ="), editor.indexOf("const dossierMenu ="));
  assert.match(primary, /stayAction === "montrer"/);
  assert.match(primary, /Montrer au client/);
  assert.match(primary, /Enregistrer/);
  assert.match(primary, /enregistrer-mettre-a-jour/);
  assert.equal(primary.includes("Cacher au client"), false);
  assert.match(primary, /: null;/);
  assert.match(menu, /Cartes d’embarquement/);
  assert.match(menu, /Ouvrir l’espace client/);
  assert.ok(menu.indexOf("Ouvrir l’espace client") < menu.indexOf("Voir comme le client"));
  assert.match(menu, /clientSpace\.start\(\)/);
  assert.match(menu, /Voir comme le client/);
  assert.match(menu, /Couverture/);
  assert.match(menu, /Cacher au client/);
  assert.match(menu, /Mettre à jour le carnet/);
  assert.match(menu, /Annuler le dossier/);
  assert.equal(menu.includes("Autre version"), false);
  assert.equal(menu.includes("Aperçu de l’espace client"), false);
  assert.equal(menu.includes("Photo du lieu"), false);
  assert.match(editor, /onUsePlacePhoto/);
  assert.match(editor, /clientSpace\.dialog/);
  assert.match(editor, /← Dossiers/);
  assert.equal(editor.includes("← Réservations"), false);
});

test("le dossier et la fiche ouvrent l’espace client par le même lien", () => {
  const space = readFileSync(join(root, "components/admin/OpenClientSpace.tsx"), "utf8");
  const invite = readFileSync(join(root, "components/admin/InviteCustomerPanel.tsx"), "utf8");
  assert.match(space, /\/api\/admin\/clients\/\$\{customerId\}\/ouvrir/);
  assert.match(space, /Lien d’ouverture prêt : 10 minutes, une seule ouverture/);
  assert.match(space, /fenêtre privée/);
  assert.match(space, /Rien n’est envoyé au client/);
  assert.match(space, /Ouvrir dans un onglet/);
  assert.match(invite, /<OpenClientSpace/);
  assert.equal(invite.includes("/ouvrir"), false);
});

test("une étape s’applique puis s’enregistre, sans second bandeau", () => {
  const panel = readFileSync(join(root, "components/admin/BookingItemsPanel.tsx"), "utf8");
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  assert.equal(panel.includes(">\n                    Valider\n"), false);
  assert.match(panel, /Appliquer/);
  assert.equal(panel.includes("Pas encore enregistré"), false);
  assert.equal(panel.includes("pendingIds"), false);
  assert.match(panel, /setCardVisible\(item, concealed\)/);
  assert.equal(panel.includes('method: "PATCH"'), false);
  assert.match(editor, /Modifications non enregistrées/);
});

test("une seule zone de dépôt sur Voyage : joindre sans lire est une option", () => {
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  const voyage = editor.slice(editor.indexOf('{tab === "voyage" ? ('), editor.indexOf('{tab === "client" ? ('));
  assert.match(voyage, /<BookingIngest/);
  assert.match(voyage, /<details[^>]*>\s*<summary[^>]*>\s*<span>Joindre une pièce sans la lire<\/span>/);
  assert.equal(editor.includes("Ou joindre une pièce sans la lire"), false);
});
