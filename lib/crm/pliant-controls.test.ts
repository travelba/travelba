import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PLIANT_TRANSACTIONS,
  emptyPliantCardControls,
  pliantControlsAreOpen,
  pliantIssuePayload,
} from "./pliant-controls";

test("une carte générée part sans blocage commerçant, catégorie, pays ni devise", () => {
  const controls = emptyPliantCardControls();
  assert.equal(controls.categories, null);
  assert.equal(controls.merchants, null);
  assert.equal(controls.dates, null);
  assert.equal(controls.times, null);
  assert.equal(controls.locations, null);
  assert.equal(controls.countries, null);
  assert.equal(controls.currencies, null);
  assert.equal(controls.acceptanceMethods, null);

  const body = pliantIssuePayload(
    {
      label: "Hôtel",
      purpose: "Martin – Hôtel – TB-2026-0088",
      limit: { value: 150000, currency: "EUR" },
      transactionLimit: { value: 150000, currency: "EUR" },
      type: "TRAVEL",
      additionalLimits: [{ currency: "EUR" }],
      cardControls: {
        categories: { type: "MCC", restriction: "BLOCKED", values: ["4829", "6012"] },
        merchants: { type: "MID", restriction: "ALLOWED", values: ["123"] },
        countries: { restriction: "ALLOWED", values: ["FRA"] },
        currencies: { restriction: "ALLOWED", values: ["EUR"] },
      },
    },
    { organizationId: "org", cardConfig: "PLIANT_VIRTUAL" }
  );
  assert.equal(body.organizationId, "org");
  assert.equal(body.cardConfig, "PLIANT_VIRTUAL");
  assert.equal(body.label, "Hôtel");
  assert.equal(body.purpose, "Martin – Hôtel – TB-2026-0088");
  assert.deepEqual(body.limit, { value: 150000, currency: "EUR" });
  assert.deepEqual(body.transactionLimit, { value: 150000, currency: "EUR" });
  assert.equal(body.maxTransactionCount, DEFAULT_PLIANT_TRANSACTIONS);
  assert.equal(body.maxTransactionCount, 2);
  assert.equal(Object.hasOwn(body, "type"), false);
  assert.equal(Object.hasOwn(body, "additionalLimits"), false);
  assert.deepEqual(body.cardControls, controls);
  assert.equal(pliantControlsAreOpen(controls), true);
  assert.equal(pliantControlsAreOpen({ cardControls: controls }), true);
  assert.equal(
    pliantControlsAreOpen({
      categories: null,
      merchants: { type: "MID", restriction: "BLOCKED", values: ["498750040214654"] },
    }),
    false
  );
  assert.equal(
    pliantControlsAreOpen({
      cardControls: { currencies: { restriction: "ALLOWED", values: ["EUR"] } },
    }),
    false
  );
  assert.equal(pliantControlsAreOpen(null), false);
});

test("un nombre de transactions choisi reste, sans ajouter de restriction", () => {
  const body = pliantIssuePayload(
    {
      label: "Client – Hôtel – Dossier",
      limit: { value: 60240250, currency: "EUR" },
      transactionLimit: { value: 1000, currency: "EUR" },
      maxTransactionCount: 5,
      cardControls: {
        acceptanceMethods: { type: "ACCEPTANCE_METHOD", restriction: "ALLOWED", values: ["ONLINE"] },
      },
    },
    { organizationId: "org", cardConfig: "PLIANT_VIRTUAL" }
  );
  assert.equal(body.maxTransactionCount, 5);
  assert.deepEqual(body.limit, { value: 60240250, currency: "EUR" });
  assert.deepEqual(body.transactionLimit, { value: 1000, currency: "EUR" });
  assert.equal(body.cardControls.currencies, null);
  assert.equal(body.cardControls.countries, null);
  assert.equal(body.cardControls.merchants, null);
  assert.equal(body.cardControls.categories, null);
  assert.equal(body.cardControls.acceptanceMethods, null);
  assert.equal(body.label, "Client – Hôtel – Dossier");
});
