import assert from "node:assert/strict";
import test from "node:test";
import { safeInternalPath } from "./safe-path";

test("un chemin interne passe tel quel", () => {
  assert.equal(safeInternalPath("/mon-compte?x=1"), "/mon-compte?x=1");
  assert.equal(safeInternalPath("/admin"), "/admin");
  assert.equal(safeInternalPath("/mon-compte/reservations/TB-2026-0004"), "/mon-compte/reservations/TB-2026-0004");
  assert.equal(safeInternalPath("  /mon-compte  "), "/mon-compte");
});

test("toute sortie du site retombe sur le repli", () => {
  assert.equal(safeInternalPath("/\\evil.com"), "/mon-compte");
  assert.equal(safeInternalPath("//evil.com"), "/mon-compte");
  assert.equal(safeInternalPath("\\\\evil.com"), "/mon-compte");
  assert.equal(safeInternalPath("/%5Cevil.com"), "/mon-compte");
  assert.equal(safeInternalPath("/%5cevil.com"), "/mon-compte");
  assert.equal(safeInternalPath("https://evil.com"), "/mon-compte");
  assert.equal(safeInternalPath("http://evil.com/mon-compte"), "/mon-compte");
  assert.equal(safeInternalPath("/mon-compte://evil.com"), "/mon-compte");
  assert.equal(safeInternalPath("javascript:alert(1)"), "/mon-compte");
  assert.equal(safeInternalPath("mon-compte"), "/mon-compte");
  assert.equal(safeInternalPath("/mon\ncompte"), "/mon-compte");
  assert.equal(safeInternalPath(""), "/mon-compte");
  assert.equal(safeInternalPath(null), "/mon-compte");
  assert.equal(safeInternalPath(undefined, "/admin"), "/admin");
});

test("le repli est celui demandé", () => {
  assert.equal(safeInternalPath("//evil.com", "/admin"), "/admin");
});
