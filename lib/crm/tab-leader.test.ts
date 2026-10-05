import assert from "node:assert/strict";
import test from "node:test";
import { LEADER_STALE_MS, leaderRecord, parseLeaderRecord, shouldLead } from "./tab-leader";

test("un seul onglet mène : le premier, puis celui qui trouve un battement périmé", () => {
  const now = 1_000_000;
  assert.equal(shouldLead(null, "a", now), true);
  const a = leaderRecord("a", now);
  assert.equal(shouldLead(a, "a", now + 60_000), true);
  assert.equal(shouldLead(a, "b", now + 60_000), false);
  assert.equal(shouldLead(a, "b", now + LEADER_STALE_MS + 1), true);
});

test("le battement se relit depuis le stockage, sans casser sur une valeur étrange", () => {
  assert.deepEqual(parseLeaderRecord(JSON.stringify(leaderRecord("a", 5))), { id: "a", at: 5 });
  assert.equal(parseLeaderRecord("{"), null);
  assert.equal(parseLeaderRecord('{"id":1}'), null);
  assert.equal(parseLeaderRecord(null), null);
});
