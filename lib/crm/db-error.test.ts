import assert from "node:assert/strict";
import test from "node:test";
import { dbErrorMessage, passwordErrorMessage } from "./db-error";

test("auth password errors are explained in French", () => {
  assert.equal(
    passwordErrorMessage({ code: "same_password", message: "New password should be different" }),
    "Choisissez un mot de passe différent de l’ancien."
  );
  assert.match(passwordErrorMessage({ code: "weak_password" }), /trop simple/);
  assert.match(passwordErrorMessage({ code: "session_expired" }), /nouveau lien/);
  const out = passwordErrorMessage({ code: "unexpected_failure", message: "pg: boom" });
  assert.equal(out.includes("boom"), false);
});

test("postgres codes map to neutral French messages", () => {
  assert.equal(dbErrorMessage({ code: "23505", message: "duplicate key value violates" }), "Cette valeur existe déjà.");
  assert.equal(dbErrorMessage({ code: "23503" }), "Élément lié introuvable.");
  assert.match(
    dbErrorMessage({
      code: "23502",
      message: 'null value in column "title" of relation "crm_bookings" violates not-null constraint',
    }),
    /titre/
  );
  assert.match(
    dbErrorMessage({
      code: "23505",
      message: 'duplicate key value violates unique constraint, Key (email)=()',
    }),
    /existe déjà/
  );
  assert.equal(dbErrorMessage({ code: "22P02" }), "Format de valeur invalide.");
  assert.equal(dbErrorMessage({ code: "PGRST116" }), "Élément introuvable.");
  assert.equal(dbErrorMessage({ code: "42501" }), "Accès refusé.");
  assert.match(dbErrorMessage({ code: "42P10" }), /contrainte de dossier/);
});

test("unknown errors never leak the raw message", () => {
  const raw = 'relation "crm_secret" does not exist';
  const out = dbErrorMessage({ code: "42P01", message: raw });
  assert.equal(out.includes("crm_secret"), false);
  assert.equal(out, "Opération impossible. Réessayez.");
  assert.equal(dbErrorMessage(null, "Enregistrement impossible."), "Enregistrement impossible.");
});
