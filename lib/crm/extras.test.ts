import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingHasFlight,
  countExtraHeads,
  extraAmount,
  extraFlightAt,
  extraNoticeOk,
  extraScheduleStart,
  extraTitle,
  findExtra,
  formatEuroWhole,
  greeterTariffLine,
  isChildAt,
  scheduleExtraStart,
  shiftIsoMinutes,
  showsServiceClock,
} from "./extras";

test("tarifs par trajet", () => {
  assert.equal(extraAmount("chauffeur"), 150);
  assert.equal(extraAmount("greeter", 2, 1), 225);
  assert.equal(extraTitle("chauffeur", "departure"), "Chauffeur privé — domicile → aéroport");
  assert.equal(extraTitle("chauffeur", "arrival"), "Chauffeur privé — aéroport → domicile");
  assert.equal(extraTitle("greeter", "arrival"), "Greeter — arrivée");
  assert.equal(formatEuroWhole(150), "150 €");
  assert.equal(greeterTariffLine(2, 1), "2 × 100 € + 1 × 25 € = 225 €");
  assert.equal(greeterTariffLine(1, 0), "100 €");
});

test("enfant < 12 ans, sans naissance = adulte", () => {
  const at = new Date("2026-08-12T12:00:00");
  assert.equal(isChildAt("2016-08-13", at), true);
  assert.equal(isChildAt("2014-08-12", at), false);
  const heads = countExtraHeads([{ birth_date: null }, { birth_date: "2020-01-01" }], at);
  assert.equal(heads.adults, 1);
  assert.equal(heads.children, 1);
  assert.equal(heads.missingBirth, 1);
});

test("fenêtre 48 h et unicité par trajet", () => {
  const now = new Date("2026-08-10T10:00:00Z");
  assert.equal(extraNoticeOk("2026-08-13T10:00:00Z", now), true);
  assert.equal(extraNoticeOk("2026-08-11T10:00:00Z", now), false);
  const items = [
    { kind: "flight", start_at: "2026-08-12T08:00:00" },
    { kind: "flight", start_at: "2026-08-20T18:00:00" },
    { kind: "chauffeur", details: { service_leg: "departure" } },
  ];
  assert.equal(extraFlightAt(items, "departure"), "2026-08-12T08:00:00");
  assert.equal(extraFlightAt(items, "arrival"), "2026-08-20T18:00:00");
  assert.ok(findExtra(items, "chauffeur", "departure"));
  assert.equal(findExtra(items, "chauffeur", "arrival"), null);
});

test("chauffeur privé 2 h 30 avant le décollage, y compris la veille", () => {
  assert.equal(shiftIsoMinutes("2026-08-12T10:00:00", -150), "2026-08-12T07:30:00");
  assert.equal(shiftIsoMinutes("2026-08-12T01:00:00+02:00", -150), "2026-08-11T22:30:00+02:00");
  assert.equal(shiftIsoMinutes("2026-08-12", -150), "2026-08-12");
  assert.equal(shiftIsoMinutes("2026-08-12T00:00:00", -150), "2026-08-12T00:00:00");
  const items = [
    { kind: "flight", start_at: "2026-08-12T01:00:00" },
    { kind: "flight", start_at: "2026-08-20T18:00:00" },
    { kind: "chauffeur", start_at: "2026-08-12T01:00:00", details: { service_leg: "departure" } },
    { kind: "greeter", start_at: "2026-08-12T01:00:00", details: { service_leg: "departure" } },
    { kind: "chauffeur", start_at: "2026-08-20T18:00:00", details: { service_leg: "arrival" } },
  ];
  assert.equal(
    extraScheduleStart(items[2], items),
    "2026-08-11T22:30:00"
  );
  assert.equal(scheduleExtraStart("greeter", "departure", "2026-08-12T01:00:00"), "2026-08-12T01:00:00");
  assert.equal(extraScheduleStart(items[4], items), "2026-08-20T18:00:00");
  assert.equal(showsServiceClock(items[2]), true);
  assert.equal(showsServiceClock(items[3]), false);
  assert.equal(showsServiceClock(items[4]), false);
});

test("chauffeur et greeter seulement s’il y a un vol", () => {
  assert.equal(bookingHasFlight([]), false);
  assert.equal(bookingHasFlight([{ kind: "hotel" }]), false);
  assert.equal(bookingHasFlight([{ kind: "flight" }]), true);
  assert.equal(extraFlightAt([{ kind: "hotel", start_at: "2026-08-12" }], "departure", "2026-08-01"), null);
});
