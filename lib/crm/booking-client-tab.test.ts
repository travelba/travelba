import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("l’onglet Client d’un dossier résume la fiche, sans l’éditer", () => {
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  const page = readFileSync(join(root, "app/admin/reservations/[id]/page.tsx"), "utf8");
  assert.equal(editor.includes("<CustomerEditor"), false, "la fiche complète se modifie sur /admin/clients/[id]");
  assert.match(editor, /Ouvrir la fiche/);
  assert.match(editor, /Identité, coordonnées, passeports et sociétés se modifient sur la fiche client/);
  assert.match(editor, /<CustomerPickField\s+name="customer_id"/);
  assert.match(editor, /Sur ce séjour/);
  assert.match(editor, /<TripSharePanel/);
  assert.match(editor, /<CustomerLoginLog/);
  assert.match(page, /ficheBillingCompanies=\{ficheBillingCompanies\}/);
  assert.equal(page.includes("companyAdmins"), false);
  assert.equal(page.includes('eq("company_role", "admin")'), false);
});

test("le fil WhatsApp vit dans l’onglet Client", () => {
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  const client = editor.slice(editor.indexOf('{tab === "client" ? ('), editor.indexOf('{tab === "argent" ? ('));
  assert.match(client, /<WhatsappThread/);
  assert.equal(editor.includes('tab === "whatsapp"'), false);
  assert.equal(editor.includes('tab === "interface"'), false);
  assert.match(editor, /Aperçu de l’espace client/);
});

test("le geste principal du dossier ne disparaît jamais", () => {
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  const primary = editor.slice(editor.indexOf("const primaryAction ="), editor.indexOf("const passesButton ="));
  assert.match(primary, /Montrer au client/);
  assert.match(primary, /Mettre à jour le carnet/);
  assert.match(primary, /Cacher au client/);
  assert.equal(/\) : null;\s*$/.test(primary.trim()), false);
  assert.match(editor, /← Dossiers/);
  assert.equal(editor.includes("← Réservations"), false);
});

test("une étape s’applique puis s’enregistre, et le dit", () => {
  const panel = readFileSync(join(root, "components/admin/BookingItemsPanel.tsx"), "utf8");
  assert.equal(panel.includes(">\n                    Valider\n"), false);
  assert.match(panel, /Appliquer/);
  assert.match(panel, /Pas encore enregistré/);
  assert.match(panel, /pendingIds\.has\(item\.id\)/);
});

test("une seule zone de dépôt sur Voyage : joindre sans lire est une option", () => {
  const editor = readFileSync(join(root, "components/admin/BookingEditor.tsx"), "utf8");
  const voyage = editor.slice(editor.indexOf('{tab === "voyage" ? ('), editor.indexOf('{tab === "client" ? ('));
  assert.match(voyage, /<BookingIngest/);
  assert.match(voyage, /<details[^>]*>\s*<summary[^>]*>\s*<span>Joindre une pièce sans la lire<\/span>/);
  assert.equal(editor.includes("Ou joindre une pièce sans la lire"), false);
});
