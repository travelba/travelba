import assert from "node:assert/strict";
import { test } from "node:test";
import { shellAdminBooking } from "./admin-booking-shell";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("le premier rendu n’attend ni Stripe, ni Little Emperors, ni la réparation", async () => {
  const externalMs = 500;
  const criticalMs = 30;
  const started = Date.now();
  let repairStarted = false;
  const before = criticalMs + externalMs * 3;
  const shell = await shellAdminBooking({
    critical: async () => {
      await wait(criticalMs);
      return { header: true };
    },
    reconcile: async () => {
      await wait(externalMs);
      return { ledger: "stripe" };
    },
    enrich: async () => {
      await wait(externalMs);
      return [{ kind: "hotel" }];
    },
    repair: async () => {
      repairStarted = true;
      await wait(externalMs);
    },
    schedule: (task) => {
      void task();
    },
  });
  const firstPaint = Date.now() - started;
  assert.equal(shell.value.header, true);
  assert.equal(repairStarted, true);
  assert.ok(firstPaint < 200, `premier rendu ${firstPaint} ms, avant ~${before} ms`);
  const [ledger, hotels] = await Promise.all([shell.reconcile, shell.enrich]);
  assert.deepEqual(ledger, { ledger: "stripe" });
  assert.equal(hotels?.[0]?.kind, "hotel");
  const finished = Date.now() - started;
  console.log(`[dossier] simulation avant ~${before} ms, premier rendu ${firstPaint} ms, tout fini ${finished} ms`);
  assert.ok(finished + 50 >= externalMs);
});
