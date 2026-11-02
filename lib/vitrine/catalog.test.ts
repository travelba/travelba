import assert from "node:assert/strict";
import test from "node:test";
import { destinations } from "./destinations/index";
import { universes } from "./universes";

test("quarante-trois voyages signature", () => {
  assert.equal(destinations.length, 43);
  const slugs = new Set(destinations.map((item) => item.slug));
  assert.equal(slugs.size, 43);
  for (const item of destinations) {
    assert.ok(item.essay.length > 40, item.slug);
    assert.ok(item.line.length > 8, item.slug);
    assert.ok(item.itineraries.length >= 1, item.slug);
    for (const trip of item.itineraries) {
      assert.ok(trip.steps.length >= 4, `${item.slug}/${trip.anchor}`);
      assert.ok(trip.houses.length >= 2, trip.title);
      assert.ok(trip.experiences.length >= 3, trip.title);
      assert.match(trip.duration, /jours/);
      assert.ok(trip.season.length > 15, trip.title);
    }
  }
  const inde = destinations.find((item) => item.slug === "inde");
  assert.equal(inde?.itineraries.length, 2);
  assert.equal(inde?.itineraries[0]?.anchor, "nord");
  assert.equal(inde?.itineraries[1]?.anchor, "sud");
});

test("les univers ont un récit et un déroulé", () => {
  const slugs = new Set(universes.map((item) => item.slug));
  assert.equal(slugs.size, universes.length);
  for (const item of universes) {
    assert.ok(item.essay.length >= 2, item.slug);
    assert.ok(item.steps.length >= 3, item.slug);
    assert.ok(item.places.length >= 2, item.slug);
    assert.ok(item.app.length > 20, item.slug);
  }
});
