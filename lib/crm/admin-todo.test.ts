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
  });
  assert.deepEqual(
    lines.map((line) => line.id),
    ["whatsapp", "le", "formalities", "services", "depart-tomorrow", "expiring"]
  );
  assert.equal(lines[0].label, "2 demandes WhatsApp à traiter");
  assert.equal(lines[0].href, "/admin?discussions=escalade");
  assert.equal(lines[1].label, "1 séjour Little Emperors sans dossier");
  assert.equal(lines[2].label, "1 formalité ouverte");
  assert.equal(lines[2].href, "/admin/formalites");
  assert.equal(lines[3].label, "1 service à confirmer");
  assert.equal(lines[3].href, "/admin/services");
  assert.equal(lines[4].href, "/admin/reservations?etat=a-venir");
  assert.equal(adminTodoTotal(lines), 9);
});

test("rien à faire : liste vide", () => {
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
