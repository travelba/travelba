import assert from "node:assert/strict";
import test from "node:test";
import { isRevolutTimestampFresh, REVOLUT_WEBHOOK_MAX_AGE_MS, revolutTimestampMs } from "./revolut-webhook";

const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);

test("lit les millisecondes Revolut et tolère les secondes", () => {
  assert.equal(revolutTimestampMs(String(NOW)), NOW);
  assert.equal(revolutTimestampMs(String(Math.floor(NOW / 1000))), Math.floor(NOW / 1000) * 1000);
  assert.equal(revolutTimestampMs(""), null);
  assert.equal(revolutTimestampMs(null), null);
  assert.equal(revolutTimestampMs("hier"), null);
  assert.equal(revolutTimestampMs("2026-10-04T12:00:00Z"), null);
  assert.equal(revolutTimestampMs("12345"), null);
});

test("accepte 5 minutes de décalage, rejette au-delà, l’absence et le futur lointain", () => {
  assert.equal(REVOLUT_WEBHOOK_MAX_AGE_MS, 300_000);
  assert.equal(isRevolutTimestampFresh(String(NOW), NOW), true);
  assert.equal(isRevolutTimestampFresh(String(NOW - 299_000), NOW), true);
  assert.equal(isRevolutTimestampFresh(String(NOW - 300_000), NOW), true);
  assert.equal(isRevolutTimestampFresh(String(NOW - 301_000), NOW), false);
  assert.equal(isRevolutTimestampFresh(String(NOW + 301_000), NOW), false);
  assert.equal(isRevolutTimestampFresh(String(Math.floor((NOW - 60_000) / 1000)), NOW), true);
  assert.equal(isRevolutTimestampFresh("", NOW), false);
  assert.equal(isRevolutTimestampFresh(undefined, NOW), false);
});
