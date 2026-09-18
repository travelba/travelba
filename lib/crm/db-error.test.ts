import assert from "node:assert/strict";
import test from "node:test";
import { dbErrorMessage } from "./db-error";

test("postgres codes map to neutral French messages", () => {
  assert.equal(dbErrorMessage({ code: "23505", message: "duplicate key value violates" }), "Cette valeur existe déjà.");
  assert.equal(dbErrorMessage({ code: "23503" }), "Élément lié introuvable.");
  assert.equal(dbErrorMessage({ code: "22P02" }), "Format de valeur invalide.");
  assert.equal(dbErrorMessage({ code: "PGRST116" }), "Élément introuvable.");
  assert.equal(dbErrorMessage({ code: "42501" }), "Accès refusé.");
});

test("unknown errors never leak the raw message", () => {
  const raw = 'relation "crm_secret" does not exist';
  const out = dbErrorMessage({ code: "42P01", message: raw });
  assert.equal(out.includes("crm_secret"), false);
  assert.equal(out, "Opération impossible. Réessayez.");
  assert.equal(dbErrorMessage(null, "Enregistrement impossible."), "Enregistrement impossible.");
});
