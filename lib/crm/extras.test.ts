import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingHasFlight,
  countExtraHeads,
  extraAmount,
  extraFlightAt,
  extraNoticeOk,
  extraTitle,
  findExtra,
  isChildAt,
  serviceOffers,
} from "./extras";

test("tarifs par trajet", () => {
  assert.equal(extraAmount("chauffeur"), 150);
  assert.equal(extraAmount("greeter", 2, 1), 225);
  assert.equal(extraTitle("chauffeur", "departure"), "Transfert aller");
  assert.equal(extraTitle("greeter", "arrival"), "Greeter Airport retour");
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

test("le transfert est réservé 2 h 30 avant le départ, le greeter à l’arrivée", () => {
  const outbound = {
    kind: "flight",
    start_at: "2026-12-14T11:30:00+00:00",
    end_at: "2026-12-14T17:10:00+00:00",
    details: {
      from: "ORY",
      to: "TLV",
      city_from: "Paris",
      city_to: "Tel Aviv",
      flight_number: "TO 3458",
    },
  };
  const inbound = {
    kind: "flight",
    start_at: "2026-12-23 14:10:00+00",
    end_at: "2026-12-23 18:25:00+00",
    details: {
      from: "TLV",
      to: "ORY",
      city_from: "Tel Aviv",
      city_to: "Paris",
      flight_number: "TO 3451",
    },
  };
  const offers = serviceOffers([outbound, inbound]);
  assert.deepEqual(
    offers.map((offer) => `${offer.kind}:${offer.title}`),
    ["chauffeur:Aller", "greeter:Aller", "chauffeur:Retour", "greeter:Retour"]
  );
  assert.equal(offers[0].route, "Domicile → ORY");
  assert.equal(offers[0].flightLine, "Prise en charge 09h00 · Vol TO 3458 · départ 11h30");
  assert.equal(offers[0].whenIso, "2026-12-14T09:00:00");
  assert.equal(offers[0].airport, "ORY · Paris");
  assert.equal(offers[1].route, "Aéroport TLV · Tel Aviv");
  assert.equal(offers[1].flightLine, "Vol TO 3458 · arrivée 17h10");
  assert.equal(offers[2].route, "Domicile → TLV");
  assert.equal(offers[2].flightLine, "Prise en charge 11h40 · Vol TO 3451 · départ 14h10");
  assert.equal(offers[2].whenIso, "2026-12-23T11:40:00");
  assert.equal(offers[3].route, "Aéroport ORY · Paris");
  assert.equal(offers[3].flightLine, "Vol TO 3451 · arrivée 18h25");
  const oneWay = serviceOffers([outbound]);
  assert.deepEqual(
    oneWay.map((offer) => offer.leg),
    ["departure", "departure"]
  );
});

test("chauffeur et greeter seulement s’il y a un vol", () => {
  assert.equal(bookingHasFlight([]), false);
  assert.equal(bookingHasFlight([{ kind: "hotel" }]), false);
  assert.equal(bookingHasFlight([{ kind: "flight" }]), true);
  assert.equal(extraFlightAt([{ kind: "hotel", start_at: "2026-08-12" }], "departure", "2026-08-01"), null);
});
