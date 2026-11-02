import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyPliantCardControls,
  parsePliantTransactionCount,
  PLIANT_SINGLE_USE,
  PLIANT_VIRTUAL,
  pliantCardForTransactionCount,
  pliantControlsAreOpen,
  pliantIssuePayload,
} from "./pliant-controls";
import { manualStayCardBody } from "./manual-stay-card";

test("une carte à usage unique part sans blocage et sans nombre de transactions", () => {
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
      validFrom: "2026-10-04",
      validTo: "2026-10-12",
      validTimezone: "Europe/Paris",
      type: "TRAVEL",
      additionalLimits: [{ currency: "EUR" }],
      maxTransactionCount: 2,
      cardControls: {
        categories: { type: "MCC", restriction: "BLOCKED", values: ["4829", "6012"] },
        merchants: { type: "MID", restriction: "ALLOWED", values: ["123"] },
        countries: { restriction: "ALLOWED", values: ["FRA"] },
        currencies: { restriction: "ALLOWED", values: ["EUR"] },
      },
    },
    { organizationId: "org", cardConfig: PLIANT_SINGLE_USE }
  );
  assert.equal(body.organizationId, "org");
  assert.equal(body.cardConfig, PLIANT_SINGLE_USE);
  assert.equal(body.label, "Hôtel");
  assert.equal(body.purpose, "Martin – Hôtel – TB-2026-0088");
  assert.deepEqual(body.limit, { value: 150000, currency: "EUR" });
  assert.deepEqual(body.transactionLimit, { value: 150000, currency: "EUR" });
  assert.equal(body.validFrom, "2026-10-04");
  assert.equal(body.validTo, "2026-10-12");
  assert.equal(body.validTimezone, "Europe/Paris");
  assert.equal(Object.hasOwn(body, "maxTransactionCount"), false);
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

test("un nombre saisi est ignoré sur une carte à usage unique, et l’objet reprend le libellé", () => {
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
    { organizationId: "org", cardConfig: PLIANT_SINGLE_USE }
  );
  assert.equal(Object.hasOwn(body, "maxTransactionCount"), false);
  assert.equal(body.purpose, "Client – Hôtel – Dossier");
  assert.deepEqual(body.limit, { value: 60240250, currency: "EUR" });
  assert.deepEqual(body.transactionLimit, { value: 1000, currency: "EUR" });
  assert.equal(body.cardControls.currencies, null);
  assert.equal(body.cardControls.countries, null);
  assert.equal(body.cardControls.merchants, null);
  assert.equal(body.cardControls.categories, null);
  assert.equal(body.cardControls.acceptanceMethods, null);
  assert.equal(body.label, "Client – Hôtel – Dossier");
});

test("un nombre d’achats : 1 reste à usage unique, davantage part en carte virtuelle", () => {
  assert.deepEqual(parsePliantTransactionCount(undefined), { ok: true, count: 1 });
  assert.deepEqual(parsePliantTransactionCount(""), { ok: true, count: 1 });
  assert.deepEqual(parsePliantTransactionCount("  "), { ok: true, count: 1 });
  assert.deepEqual(parsePliantTransactionCount(1), { ok: true, count: 1 });
  assert.deepEqual(parsePliantTransactionCount("5"), { ok: true, count: 5 });
  assert.equal(parsePliantTransactionCount(0).ok, false);
  assert.equal(parsePliantTransactionCount(1.5).ok, false);
  assert.equal(parsePliantTransactionCount("5,0").ok, false);
  assert.equal(parsePliantTransactionCount("beaucoup").ok, false);
  assert.equal(parsePliantTransactionCount(1_000_000_000).ok, false);

  assert.deepEqual(pliantCardForTransactionCount(1), {
    cardConfig: PLIANT_SINGLE_USE,
    maxTransactionCount: null,
  });
  assert.deepEqual(pliantCardForTransactionCount(5), {
    cardConfig: PLIANT_VIRTUAL,
    maxTransactionCount: 5,
  });

  const reusable = manualStayCardBody({
    firstName: "Camille",
    lastName: "Martin",
    limitCents: 150_000,
    transactionLimitCents: 40_000,
    transactionCount: 5,
    validFrom: "2026-10-04",
    validTo: "2026-10-12",
    organizationId: "org",
    designation: "Hôtel",
  });
  const issued = pliantIssuePayload(reusable, { organizationId: "org", cardConfig: reusable.cardConfig });
  assert.equal(issued.cardConfig, PLIANT_VIRTUAL);
  assert.equal(issued.maxTransactionCount, 5);
  assert.deepEqual(issued.limit, { value: 150_000, currency: "EUR" });
  assert.deepEqual(issued.transactionLimit, { value: 40_000, currency: "EUR" });
  assert.equal(issued.limitRenewFrequency, "TOTAL");
  assert.deepEqual(issued.cardControls, emptyPliantCardControls());
  assert.equal(issued.cardControls.merchants, null);
  assert.equal(issued.cardControls.categories, null);
  assert.equal(issued.cardControls.countries, null);
  assert.equal(issued.cardControls.currencies, null);
  assert.equal(issued.cardControls.acceptanceMethods, null);

  const once = manualStayCardBody({
    firstName: "Camille",
    lastName: "Martin",
    limitCents: 150_000,
    transactionCount: 1,
    validFrom: "2026-10-04",
    validTo: "2026-10-12",
    organizationId: "org",
  });
  const single = pliantIssuePayload(once, { organizationId: "org", cardConfig: once.cardConfig });
  assert.equal(single.cardConfig, PLIANT_SINGLE_USE);
  assert.equal(Object.hasOwn(single, "maxTransactionCount"), false);
  assert.deepEqual(single.transactionLimit, { value: 150_000, currency: "EUR" });
});

test("une carte virtuelle de formalité garde le nombre d’autorisations saisi", () => {
  const body = pliantIssuePayload(
    {
      label: "Prenom Nom",
      limit: { value: 4000, currency: "EUR" },
      transactionLimit: { value: 4000, currency: "EUR" },
      maxTransactionCount: 4,
    },
    { organizationId: "org", cardConfig: "PLIANT_VIRTUAL" }
  );
  assert.equal(body.cardConfig, "PLIANT_VIRTUAL");
  assert.equal(body.maxTransactionCount, 4);
  assert.equal(body.cardControls.currencies, null);
});
