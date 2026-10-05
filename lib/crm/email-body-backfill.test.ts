import assert from "node:assert/strict";
import test from "node:test";
import {
  BODY_BACKFILL_WINDOW_DAYS,
  EMAIL_BODY_MISSING_MARK,
  bodyBackfillSince,
  hasBodyMissingMark,
  markBodyMissing,
} from "./email-body-backfill";

test("un mail sans corps chez Gmail est marqué une seule fois, les autres avertissements restent", () => {
  const warnings = [{ file: "billet.pdf", message: "Prix illisible" }, { file: null, message: null }];
  const marked = markBodyMissing(warnings);
  assert.deepEqual(marked, [{ file: "billet.pdf", message: "Prix illisible" }, { ...EMAIL_BODY_MISSING_MARK }]);
  assert.equal(hasBodyMissingMark({ warnings: marked }), true);
  assert.equal(hasBodyMissingMark({ warnings }), false);
  assert.deepEqual(markBodyMissing(marked), marked);
  assert.deepEqual(markBodyMissing(null), [{ ...EMAIL_BODY_MISSING_MARK }]);
});

test("le rattrapage ne remonte pas au-delà de 14 jours", () => {
  const now = Date.parse("2026-10-04T10:00:00.000Z");
  assert.equal(bodyBackfillSince(now), "2026-09-20T10:00:00.000Z");
  assert.equal(BODY_BACKFILL_WINDOW_DAYS, 14);
});
