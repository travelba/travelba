import assert from "node:assert/strict";
import test from "node:test";
import { SET_PASSWORD_PATH } from "./session";
import { SPACE_ACCESS_OTP, spaceAccessNextPath } from "./space-access";

test("le lien après mot de passe ouvre l’espace", () => {
  assert.equal(SPACE_ACCESS_OTP, "magiclink");
  assert.equal(spaceAccessNextPath("+33601020304"), "/mon-compte");
  assert.equal(spaceAccessNextPath(""), "/mon-compte/profil");
  assert.notEqual(spaceAccessNextPath("+33601020304"), SET_PASSWORD_PATH);
});
