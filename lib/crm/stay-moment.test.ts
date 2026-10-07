import assert from "node:assert/strict";
import test from "node:test";
import { stayDatesOpen, stayMoment, stayMomentLabel } from "./stay-moment";

const today = "2026-10-07";

test("le moment se lit sur les dates", () => {
  assert.equal(stayMoment("2026-10-20", "2026-10-24", today), "before");
  assert.equal(stayMoment("2026-10-07", "2026-10-12", today), "travelling");
  assert.equal(stayMoment("2026-10-01", "2026-10-07", today), "travelling");
  assert.equal(stayMoment("2026-09-01", "2026-09-08", today), "past");
  assert.equal(stayMoment(null, null, today), "before");
  assert.equal(stayMoment("2026-09-01", null, today), "travelling");
  assert.equal(stayMomentLabel("before"), null);
  assert.equal(stayMomentLabel("travelling"), "En voyage");
  assert.equal(stayMomentLabel("past"), "Terminée");
  assert.equal(stayDatesOpen("2026-10-07", today), true);
  assert.equal(stayDatesOpen("2026-10-06", today), false);
  assert.equal(stayDatesOpen(null, today), true);
});
