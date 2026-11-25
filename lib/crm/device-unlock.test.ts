import assert from "node:assert/strict";
import test from "node:test";
import { createUnlockToken, hashUnlockToken, nextUnlockExpiry, unlockSessionDecision, unlockTokenMatches, UNLOCK_TTL_MS } from "./device-unlock";
import { shouldLockWithBiometric, shouldOfferBiometric, shouldRestoreWithBiometric } from "./biometric-lock";

test("le jeton se range par empreinte, le clair ne se relit pas", () => {
  const { token, hash } = createUnlockToken();
  assert.match(token, /^tu_[A-Za-z0-9_-]{43}$/);
  assert.equal(hashUnlockToken(token), hash);
  assert.equal(unlockTokenMatches(token, hash), true);
  assert.equal(unlockTokenMatches(`${token}x`, hash), false);
  assert.equal(hashUnlockToken("mot-de-passe"), null);
  assert.equal(token.includes(hash), false);
});

test("un jeton révoqué, expiré ou sans titulaire n’ouvre pas la session", () => {
  const now = new Date("2026-06-15T10:00:00.000Z");
  const row = {
    revokedAt: null,
    expiresAt: nextUnlockExpiry(now),
    email: "ada@exemple.invalid",
    authUserId: "11111111-1111-1111-1111-111111111111",
  };
  assert.equal(unlockSessionDecision(row, now), "ok");
  assert.equal(unlockSessionDecision({ ...row, revokedAt: now.toISOString() }, now), "invalid");
  assert.equal(unlockSessionDecision({ ...row, expiresAt: now.toISOString() }, now), "invalid");
  assert.equal(unlockSessionDecision({ ...row, email: "" }, now), "invalid");
  assert.equal(unlockSessionDecision(null, now), "invalid");
  assert.equal(Date.parse(nextUnlockExpiry(now)) - now.getTime(), UNLOCK_TTL_MS);
});

test("Face ID se propose une fois, puis verrouille le retour et l’ouverture", () => {
  assert.equal(shouldOfferBiometric("", true), true);
  assert.equal(shouldOfferBiometric("", false), false);
  assert.equal(shouldOfferBiometric("on", true), false);
  assert.equal(shouldOfferBiometric("off", true), false);
  assert.equal(shouldLockWithBiometric("on", 5 * 60 * 1000, "/mon-compte"), true);
  assert.equal(shouldLockWithBiometric("on", 1000, "/mon-compte"), false);
  assert.equal(shouldLockWithBiometric("off", 60 * 60 * 1000, "/mon-compte"), false);
  assert.equal(shouldRestoreWithBiometric("on", "/connexion"), true);
  assert.equal(shouldRestoreWithBiometric("on", "/mon-compte/reservations"), true);
  assert.equal(shouldRestoreWithBiometric("off", "/connexion"), false);
  assert.equal(shouldRestoreWithBiometric("on", "/admin"), false);
});
