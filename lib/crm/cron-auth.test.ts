import assert from "node:assert/strict";
import test from "node:test";
import { cronAuthorized } from "./cron-auth";

test("cron rejects missing secret even with a vercel schedule header spoof", () => {
  assert.equal(cronAuthorized("Bearer anything", ""), false);
  assert.equal(cronAuthorized("Bearer anything", null), false);
});

test("cron accepts only the exact bearer secret", () => {
  assert.equal(cronAuthorized("Bearer secret", "secret"), true);
  assert.equal(cronAuthorized("Bearer other", "secret"), false);
  assert.equal(cronAuthorized(null, "secret"), false);
});
