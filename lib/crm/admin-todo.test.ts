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
  });
  assert.deepEqual(
    lines.map((line) => line.id),
    ["le", "formalities", "services", "depart-tomorrow", "expiring"]
  );
  assert.equal(lines[0].label, "1 séjour Little Emperors sans dossier");
  assert.equal(lines[1].label, "1 formalité ouverte");
  assert.equal(lines[1].href, "/admin/formalites");
  assert.equal(lines[2].label, "1 service à confirmer");
  assert.equal(lines[2].href, "/admin/services");
  assert.equal(lines[3].href, "/admin/reservations?etat=a-venir&tri=depart-asc");
  assert.equal(adminTodoTotal(lines), 7);
});

test("rien à faire : liste vide", () => {
  const lines = adminTodoLines({
    emails: 0,
    le: 0,
    formalities: 0,
    services: 0,
    departTomorrow: 0,
    expiring: 0,
  });
  assert.deepEqual(lines, []);
  assert.equal(adminTodoTotal(lines), 0);
});
