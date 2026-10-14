import assert from "node:assert/strict";
import test from "node:test";
import { emptyPliantCardControls, pliantControlsAreOpen, pliantIssuePayload } from "./pliant-controls";

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
      cardControls: {
        categories: { type: "MCC", restriction: "BLOCKED", values: ["4829", "6012"] },
        merchants: { type: "MID", restriction: "ALLOWED", values: ["123"] },
      },
    },
    { organizationId: "org", cardConfig: "PLIANT_VIRTUAL_TRAVEL" }
  );
  assert.equal(body.organizationId, "org");
  assert.equal(body.cardConfig, "PLIANT_VIRTUAL_TRAVEL");
  assert.equal(body.label, "Hôtel");
  assert.deepEqual(body.cardControls, controls);
  assert.equal(pliantControlsAreOpen(controls), true);
  assert.equal(
    pliantControlsAreOpen({
      categories: null,
      merchants: { type: "MID", restriction: "BLOCKED", values: ["498750040214654"] },
    }),
    false
  );
  assert.equal(pliantControlsAreOpen(null), false);
});
