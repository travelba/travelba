import assert from "node:assert/strict";
import test from "node:test";
import { emptyBookingExtract } from "./ingest-types";
import { routeMailExtract } from "./import-routing";

test("frais de billeterie, enregistrement et visa ne deviennent pas des étapes", () => {
  const routed = routeMailExtract({
    ...emptyBookingExtract(),
    notes_client: "Ne pas écrire ça au client",
    items: [
      {
        kind: "flight",
        title: "Paris → Rome",
        supplier: null,
        confirmation_ref: "ABC123",
        start_at: "2026-09-01T09:00:00",
        end_at: null,
        amount: 640,
        details: {},
      },
      {
        kind: "fee",
        title: "Frais de billeterie",
        supplier: null,
        confirmation_ref: null,
        start_at: null,
        end_at: null,
        amount: 25,
        details: {},
      },
      {
        kind: "checkin",
        title: "Enregistrement en ligne",
        supplier: null,
        confirmation_ref: null,
        start_at: null,
        end_at: null,
        amount: null,
        details: {},
      },
      {
        kind: "visa",
        title: "ESTA",
        supplier: null,
        confirmation_ref: null,
        start_at: null,
        end_at: null,
        amount: null,
        details: {},
      },
      {
        kind: "activity",
        title: "Pré-enregistrement hôtel",
        supplier: null,
        confirmation_ref: null,
        start_at: null,
        end_at: null,
        amount: null,
        details: {},
      },
    ],
  });
  assert.deepEqual(
    routed.extract.items.map((item) => item.kind),
    ["flight"]
  );
  assert.equal(routed.extract.notes_client, null);
  assert.deepEqual(
    routed.tasks.map((task) => task.kind),
    ["checkin", "visa", "preregistration"]
  );
});
