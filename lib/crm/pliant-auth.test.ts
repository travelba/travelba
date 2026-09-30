import assert from "node:assert/strict";
import test from "node:test";
import {
  PLIANT_TOKEN_LIMIT,
  PLIANT_TOKEN_MISSING,
  PLIANT_TOKEN_REJECTED,
  isPliantTokenFailure,
  pliantDenialUntil,
  pliantStoredDenial,
  pliantTokenBackoffMs,
  pliantTokenExtra,
  pliantTokenFailureMessage,
  pliantTokenStillValid,
} from "./pliant-auth";

const NOW = Date.parse("2026-09-30T11:15:00.000Z");

test("un jeton reste valable jusqu’à une minute de son expiration", () => {
  assert.equal(pliantTokenStillValid(NOW + 120_000, NOW), true);
  assert.equal(pliantTokenStillValid(NOW + 30_000, NOW), false);
  assert.equal(pliantTokenStillValid(Number.NaN, NOW), false);
});

test("le quota Auth0 et le refus d’identifiant ont un message distinct", () => {
  assert.equal(pliantTokenFailureMessage(429), PLIANT_TOKEN_LIMIT);
  assert.equal(pliantTokenFailureMessage(401), PLIANT_TOKEN_REJECTED);
  assert.equal(pliantTokenFailureMessage(403), PLIANT_TOKEN_REJECTED);
  assert.equal(pliantTokenFailureMessage(500), PLIANT_TOKEN_MISSING);
  assert.equal(isPliantTokenFailure(PLIANT_TOKEN_LIMIT), true);
  assert.equal(isPliantTokenFailure("Pliant n’a pas renvoyé les transactions."), false);
});

test("seul le quota bloque le prochain passage, en respectant Retry-After", () => {
  assert.equal(pliantTokenBackoffMs(401, "30"), 0);
  assert.equal(pliantTokenBackoffMs(429, null), 60 * 60 * 1000);
  assert.equal(pliantTokenBackoffMs(429, "120"), 120_000);
  assert.equal(pliantTokenBackoffMs(429, "999999"), 60 * 60 * 1000);
});

test("un blocage expiré ou inconnu ne masque pas une nouvelle demande", () => {
  const active = pliantStoredDenial(
    { token_denied_until: "2026-09-30T12:15:00.000Z", token_denied_message: PLIANT_TOKEN_LIMIT, sent: "1" },
    NOW
  );
  assert.equal(active, PLIANT_TOKEN_LIMIT);
  assert.equal(pliantDenialUntil({ token_denied_until: "2026-09-30T12:15:00.000Z", token_denied_message: PLIANT_TOKEN_LIMIT }), Date.parse("2026-09-30T12:15:00.000Z"));
  assert.equal(
    pliantStoredDenial(
      { token_denied_until: "2026-09-30T11:00:00.000Z", token_denied_message: PLIANT_TOKEN_LIMIT },
      NOW
    ),
    null
  );
  assert.equal(pliantStoredDenial({ token_denied_until: "2026-09-30T12:15:00.000Z", token_denied_message: "autre" }, NOW), null);
});

test("l’enregistrement du jeton retire le blocage sans effacer le reste", () => {
  const cleared = pliantTokenExtra(
    { token_denied_until: "2026-09-30T12:15:00.000Z", token_denied_message: PLIANT_TOKEN_LIMIT, sent: "1" },
    null
  );
  assert.deepEqual(cleared, { sent: "1" });
  const blocked = pliantTokenExtra({ sent: "1" }, { until: "2026-09-30T12:15:00.000Z", message: PLIANT_TOKEN_LIMIT });
  assert.equal(blocked.sent, "1");
  assert.equal(blocked.token_denied_message, PLIANT_TOKEN_LIMIT);
});
