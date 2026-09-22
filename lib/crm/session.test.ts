import assert from "node:assert/strict";
import test from "node:test";
import { SET_PASSWORD_PATH, mustSetPassword, pathAfterPassword, shouldForcePasswordSetup } from "./session";

test("must_set_password only from app_metadata", () => {
  assert.equal(mustSetPassword({ app_metadata: { must_set_password: true } }), true);
  assert.equal(mustSetPassword({ app_metadata: { must_set_password: false } }), false);
  assert.equal(mustSetPassword({ app_metadata: {} }), false);
});

test("recovery and invite always force the password screen", () => {
  assert.equal(
    shouldForcePasswordSetup({ flagged: false, type: "recovery", next: "/mon-compte" }),
    true
  );
  assert.equal(
    shouldForcePasswordSetup({ flagged: false, type: "invite", next: "/mon-compte" }),
    true
  );
  assert.equal(
    shouldForcePasswordSetup({ flagged: false, type: "magiclink", next: "/mon-compte" }),
    false
  );
});

test("après le mot de passe, la fiche ne s’ouvre que sans téléphone", () => {
  assert.equal(pathAfterPassword("+33600000000"), "/mon-compte");
  assert.equal(pathAfterPassword("  "), "/mon-compte/profil");
  assert.equal(pathAfterPassword(null), "/mon-compte/profil");
});

test("PKCE reset without type still forces password when next is the set-password page", () => {
  assert.equal(
    shouldForcePasswordSetup({
      flagged: false,
      type: null,
      next: SET_PASSWORD_PATH,
    }),
    true
  );
  assert.equal(
    shouldForcePasswordSetup({ flagged: false, type: null, next: "/mon-compte" }),
    false
  );
});
