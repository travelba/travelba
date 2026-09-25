import assert from "node:assert/strict";
import test from "node:test";
import { itemClock } from "./carnet";
import { exampleExtraCharges, exampleLedgerView, exampleSession, exampleSessionEnabled } from "./example-session";
import { extraNoticeOk, itineraryOffers } from "./extras";
import { isExtraItemKind } from "./types";
import { frenchPassportTrip } from "./visa-trip";

function withVercelEnv(value: string | undefined, run: () => void) {
  const previous = process.env.VERCEL_ENV;
  if (value === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
}

test("l’aperçu est fermé en production", () => {
  withVercelEnv("production", () => {
    assert.equal(exampleSessionEnabled(), false);
  });
  withVercelEnv(undefined, () => {
    assert.equal(exampleSessionEnabled(), true);
  });
});

test("le séjour d’exemple n’a pas de prix hors extras, ni d’horaire", () => {
  const session = exampleSession();
  const kinds = new Set(session.items.map((item) => item.kind));
  for (const kind of ["flight", "hotel", "transfer", "activity", "rail", "car", "cruise", "insurance"]) {
    assert.equal(kinds.has(kind as never), true, kind);
  }
  for (const item of session.items) {
    assert.equal(isExtraItemKind(item.kind), false);
    assert.equal(item.amount, null);
    assert.equal(itemClock(item.start_at), "");
    assert.equal(itemClock(item.end_at), "");
    assert.equal(item.details.phone ?? null, null);
    assert.equal(item.details.email ?? null, null);
    assert.equal(item.details.included ?? null, null);
  }
  assert.equal(session.booking.prices_visible, false);
  assert.equal(session.booking.destination, "New York");
  for (const doc of session.documents) {
    assert.equal(doc.number, null);
    assert.equal(doc.storage_path, null);
  }
  assert.equal(/simon|raphael/i.test(session.name), false);
  const offers = itineraryOffers(session.items);
  assert.ok(offers.some((offer) => offer.kind === "chauffeur"));
  assert.ok(offers.some((offer) => offer.kind === "greeter"));
  assert.equal(extraNoticeOk("2026-11-12", new Date("2026-09-25T12:00:00Z")), true);
  const trip = frenchPassportTrip(session.items, session.travelers.length);
  assert.equal(trip.needsFormality, true);
  assert.ok(trip.entries.some((entry) => entry.iso === "US"));
});

test("le grand livre d’exemple est vide avant un geste", () => {
  const view = exampleLedgerView();
  assert.equal(view.movements.length, 0);
  assert.equal(view.balanceValue, 0);
  const charges = exampleExtraCharges();
  assert.equal(charges.find((row) => row.label === "Chauffeur")?.amount, 150);
  assert.equal(charges.find((row) => row.label === "VIP Airport")?.amount, 125);
  assert.equal(charges.find((row) => row.label === "Obtention du visa")?.amount, 50);
  assert.equal(charges.find((row) => row.label === "Enregistrement")?.amount, 20);
});
