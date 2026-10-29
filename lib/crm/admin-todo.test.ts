import assert from "node:assert/strict";
import test from "node:test";
import { adminTodoLines, adminTodoTotal } from "./admin-todo";

test("la liste À faire suit l’ordre du travail et cache les zéros", () => {
  const lines = adminTodoLines({
    emails: 0,
    le: 1,
    formalities: 1,
    services: 1,
    departTomorrow: 1,
    expiring: 3,
    whatsapp: 2,
    hotels: 1,
    credits: 2,
    costs: 4,
  });
  assert.deepEqual(
    lines.map((line) => line.id),
    ["whatsapp", "le", "hotels", "credits", "costs", "formalities", "services", "depart-tomorrow", "expiring"]
  );
  assert.equal(lines[0].label, "2 demandes WhatsApp à traiter");
  assert.equal(lines[0].href, "/admin/boite?onglet=whatsapp");
  assert.equal(lines[1].label, "1 séjour Little Emperors sans dossier");
  assert.equal(lines[1].href, "/admin/boite?onglet=fournisseurs&source=little-emperors");
  assert.equal(lines[2].label, "1 réponse d’hôtel à traiter");
  assert.equal(lines[2].href, "/admin/boite?onglet=hotels");
  assert.equal(lines[3].label, "2 paiements reçus à encaisser");
  assert.equal(lines[3].href, "/admin/argent?onglet=a-encaisser");
  assert.equal(lines[4].label, "4 coûts à pointer");
  assert.equal(lines[4].href, "/admin/argent?onglet=a-pointer");
  assert.equal(lines[5].label, "1 formalité ouverte");
  assert.equal(lines[5].href, "/admin/formalites");
  assert.equal(lines[6].label, "1 service à confirmer");
  assert.equal(lines[7].href, "/admin/reservations?etat=a-venir");
  assert.equal(lines[8].href, "/admin/clients?pieces=echeance");
  assert.equal(adminTodoTotal(lines), 16);
});

test("rien à faire : liste vide ; les nouvelles files sont optionnelles", () => {
  const lines = adminTodoLines({
    emails: 0,
    le: 0,
    formalities: 0,
    services: 0,
    departTomorrow: 0,
    expiring: 0,
    whatsapp: 0,
  });
  assert.deepEqual(lines, []);
  assert.equal(adminTodoTotal(lines), 0);
});
