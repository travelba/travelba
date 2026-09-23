import assert from "node:assert/strict";
import test from "node:test";
import { exclusiveStoragePaths } from "./ids";

test("keeps passport scans still used by the client vault", () => {
  assert.deepEqual(
    exclusiveStoragePaths(
      ["customers/c/passport.pdf", "bookings/b/copy.pdf"],
      ["customers/c/passport.pdf"]
    ),
    ["bookings/b/copy.pdf"]
  );
});
