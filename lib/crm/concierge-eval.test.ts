import assert from "node:assert/strict";
import { test } from "node:test";
import { runConciergeEval } from "./concierge-eval";

test("les évaluations du concierge passent", async () => {
  const results = await runConciergeEval();
  const failed = results.filter((result) => !result.ok);
  assert.equal(
    failed.map((result) => `${result.id}: ${result.detail}`).join("\n"),
    ""
  );
});
