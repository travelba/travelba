import assert from "node:assert/strict";
import test from "node:test";
import { passportConfirmCopy, scanAwaitsConfirmation, scanWouldPersist } from "./passport-confirm";

test("le scan n’écrit rien sans fichier, sans identité, ni en admin sans client", () => {
  assert.equal(scanWouldPersist({ variant: "client", persist: true, hasFile: false, identityCount: 1 }), false);
  assert.equal(scanWouldPersist({ variant: "client", persist: true, hasFile: true, identityCount: 0 }), false);
  assert.equal(scanWouldPersist({ variant: "admin", persist: true, hasFile: true, identityCount: 1 }), false);
  assert.equal(
    scanWouldPersist({ variant: "admin", persist: true, hasFile: true, identityCount: 1, customerId: "c1" }),
    true
  );
});

test("rien ne s’enregistre avant relecture, agence comprise", () => {
  assert.equal(scanAwaitsConfirmation({ variant: "client", persist: true, hasFile: true, identityCount: 1 }), true);
  assert.equal(scanAwaitsConfirmation({ variant: "client", persist: false, hasFile: true, identityCount: 1 }), false);
  assert.equal(scanAwaitsConfirmation({ variant: "client", persist: false, hasFile: true, identityCount: 2 }), true);
  assert.equal(
    scanAwaitsConfirmation({ variant: "admin", persist: true, hasFile: true, identityCount: 1, customerId: "c1" }),
    true
  );
  assert.equal(
    scanAwaitsConfirmation({ variant: "admin", persist: false, hasFile: true, identityCount: 1, customerId: "c1" }),
    false
  );
});

test("l’agence relit la pièce, le client confirme la sienne", () => {
  const agency = passportConfirmCopy({ variant: "admin", identityCount: 1, companion: false });
  assert.equal(agency.question, "Enregistrer cette pièce ?");
  assert.equal(agency.confirm, "Enregistrer");
  assert.match(agency.hint || "", /Rien n’est écrit avant/);
  assert.equal(
    passportConfirmCopy({ variant: "admin", identityCount: 2, companion: false }).question,
    "Enregistrer ces 2 passeports ?"
  );
  assert.equal(
    passportConfirmCopy({ variant: "client", identityCount: 1, companion: false }).question,
    "C’est bien votre pièce ?"
  );
  assert.equal(
    passportConfirmCopy({ variant: "client", identityCount: 1, companion: true, firstName: "Camille" }).confirm,
    "Confirmer"
  );
});
