import assert from "node:assert/strict";
import test from "node:test";
import { travelerShownToClient, visibilityAfterImport } from "./auto-visibility";

test("une carte déjà montrée le reste, une carte nouvelle reste cachée", () => {
  assert.equal(visibilityAfterImport(true), true);
  assert.equal(visibilityAfterImport(false), false);
  assert.equal(visibilityAfterImport(null), false);
  assert.equal(visibilityAfterImport(undefined), false);
});

test("un voyageur proposé n’est pas montré, un voyageur déjà là l’est", () => {
  assert.equal(travelerShownToClient({ proposed: true }), false);
  assert.equal(travelerShownToClient({ proposed: false }), true);
  assert.equal(travelerShownToClient({}), true);
});
