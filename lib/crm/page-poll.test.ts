import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_POLL_MS, pollRunsWhileVisible } from "./page-poll";

test("le rafraîchissement d’écran ne part que si l’onglet est visible", () => {
  assert.equal(pollRunsWhileVisible("visible"), true);
  assert.equal(pollRunsWhileVisible("hidden"), false);
  assert.equal(pollRunsWhileVisible("prerender"), false);
});

test("les sondages d’écran sont plus lents que le rythme précédent", () => {
  assert.ok(PAGE_POLL_MS.whatsappInbox > 12_000);
  assert.ok(PAGE_POLL_MS.whatsappDock > 12_000);
  assert.ok(PAGE_POLL_MS.visaJourney > 5_000);
  assert.ok(PAGE_POLL_MS.etaIl > 2_000);
  assert.ok(PAGE_POLL_MS.ratehawk > 5_000);
  assert.ok(PAGE_POLL_MS.esta > 10_000);
});
