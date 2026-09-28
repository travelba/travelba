import assert from "node:assert/strict";
import test from "node:test";
import { SET_PASSWORD_PATH } from "./session";
import {
  CONNEXION_REPEAT_WINDOW_MS,
  SPACE_ACCESS_OTP,
  connexionRepeatBlocked,
  spaceAccessNextPath,
} from "./space-access";

test("le lien après mot de passe ouvre l’espace", () => {
  assert.equal(SPACE_ACCESS_OTP, "magiclink");
  assert.equal(spaceAccessNextPath("+33601020304"), "/mon-compte");
  assert.equal(spaceAccessNextPath(""), "/mon-compte");
  assert.notEqual(spaceAccessNextPath("+33601020304"), SET_PASSWORD_PATH);
});

test("un Enchanté récent bloque le second envoi", () => {
  const now = Date.parse("2026-09-28T13:37:11.452Z");
  assert.equal(connexionRepeatBlocked(null, now), false);
  assert.equal(connexionRepeatBlocked("pas une date", now), false);
  assert.equal(connexionRepeatBlocked("2026-09-28T13:35:49.245Z", now), true);
  assert.equal(
    connexionRepeatBlocked(new Date(now - CONNEXION_REPEAT_WINDOW_MS - 1000).toISOString(), now),
    false
  );
});
