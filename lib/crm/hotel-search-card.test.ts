import assert from "node:assert/strict";
import test from "node:test";
import { hotelSearchCardDraft } from "./hotel-search-card";
import { PLIANT_SINGLE_USE } from "./pliant-controls";

const base = {
  configured: true,
  firstName: "Andréa",
  lastName: "Boukris",
  hotelName: "Le Bristol",
  clientName: "Andréa Boukris",
  reference: "HS-AB12CD34",
  sellCents: 25000,
  currency: "EUR",
  checkOut: "2026-12-01",
  today: "2026-10-21",
  organizationId: "org_test",
};

test("sans sandbox, aucune carte", () => {
  const draft = hotelSearchCardDraft({ ...base, sandbox: false });
  assert.equal(draft.ok, false);
  if (!draft.ok) assert.match(draft.message, /mode test/);
});

test("sandbox : plafond exact, usage unique, titulaire sans l’hôtel", () => {
  const draft = hotelSearchCardDraft({ ...base, sandbox: true });
  assert.equal(draft.ok, true);
  if (!draft.ok) return;
  assert.equal(draft.body.limit.value, 25000);
  assert.equal(draft.body.transactionLimit.value, 25000);
  assert.equal(draft.body.limit.currency, "EUR");
  assert.equal(draft.body.cardConfig, PLIANT_SINGLE_USE);
  assert.equal("maxTransactionCount" in draft.body, false);
  assert.equal(draft.body.customFirstName, "Andrea");
  assert.equal(draft.body.customLastName, "Boukris");
  assert.doesNotMatch(`${draft.body.customFirstName} ${draft.body.customLastName}`, /Bristol/);
  assert.match(draft.body.purpose, /Le Bristol/);
  assert.match(draft.body.purpose, /HS-AB12CD34/);
  assert.match(draft.body.label, /Le Brist/);
  assert.match(draft.body.label, /HS-AB12CD34/);
});
