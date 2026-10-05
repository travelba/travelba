import assert from "node:assert/strict";
import test from "node:test";
import { scanAwaitsConfirmation, scanWouldPersist } from "./passport-confirm";

test("le scan n’écrit rien sans fichier, sans identité, ni en admin sans client", () => {
  assert.equal(scanWouldPersist({ variant: "client", persist: true, hasFile: false, identityCount: 1 }), false);
  assert.equal(scanWouldPersist({ variant: "client", persist: true, hasFile: true, identityCount: 0 }), false);
  assert.equal(scanWouldPersist({ variant: "admin", persist: true, hasFile: true, identityCount: 1 }), false);
  assert.equal(
    scanWouldPersist({ variant: "admin", persist: true, hasFile: true, identityCount: 1, customerId: "c1" }),
    true
  );
});

test("côté client, la confirmation précède tout ce qui s’enregistre", () => {
  // Vous / fiche compagnon : la pièce lue est enregistrée → confirmation.
  assert.equal(scanAwaitsConfirmation({ variant: "client", persist: true, hasFile: true, identityCount: 1 }), true);
  // Formulaire « Ajouter un accompagnateur » avec un seul passeport : le parent remplit ses champs, rien ne part.
  assert.equal(scanAwaitsConfirmation({ variant: "client", persist: false, hasFile: true, identityCount: 1 }), false);
  // Plusieurs passeports : import immédiat des inconnus → confirmation d’abord.
  assert.equal(scanAwaitsConfirmation({ variant: "client", persist: false, hasFile: true, identityCount: 2 }), true);
  // L’admin garde le geste direct.
  assert.equal(
    scanAwaitsConfirmation({ variant: "admin", persist: true, hasFile: true, identityCount: 1, customerId: "c1" }),
    false
  );
});
