import assert from "node:assert/strict";
import test from "node:test";
import { adminTodoLines, adminTodoTotal } from "./admin-todo";

test("la liste À faire suit l’ordre du travail et cache les zéros", () => {
  const lines = adminTodoLines({
    revolut: 2,
    stripe: 1,
    emails: 0,
    le: 1,
    formalities: 1,
    services: 0,
    departTomorrow: 1,
    expiring: 3,
  });
  assert.deepEqual(
    lines.map((line) => line.id),
    ["revolut", "stripe", "le", "formalities", "depart-tomorrow", "expiring"]
  );
  assert.equal(lines[0].label, "2 virements Revolut à rapprocher");
  assert.equal(lines[1].label, "1 paiement Stripe à rapprocher");
  assert.equal(lines[1].href, "/admin/stripe");
  assert.equal(lines[2].label, "1 séjour Little Emperors sans dossier");
  assert.equal(lines[3].label, "1 formalité ouverte");
  assert.equal(lines[4].href, "/admin/reservations?etat=a-venir&tri=depart-asc");
  assert.equal(adminTodoTotal(lines), 9);
});

test("rien à faire : liste vide", () => {
  const lines = adminTodoLines({
    revolut: 0,
    stripe: 0,
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
