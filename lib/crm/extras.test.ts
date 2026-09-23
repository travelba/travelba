import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingHasFlight,
  checkinFeeAmount,
  checkinFeeTitle,
  composeItineraryDay,
  countExtraHeads,
  extraAmount,
  extraFlightAt,
  extraNoticeOk,
  extraPlaceOf,
  extraTitle,
  findExtra,
  isChildAt,
  itineraryOffers,
  matchedStay,
} from "./extras";

test("tarifs par trajet", () => {
  assert.equal(extraAmount("chauffeur"), 150);
  assert.equal(extraAmount("greeter", 2, 1), 225);
  assert.equal(extraTitle("chauffeur", "departure"), "Transfert aller");
  assert.equal(extraTitle("greeter", "arrival"), "Accueil VIP et Fastpass retour");
  assert.equal(checkinFeeAmount(0), 10);
  assert.equal(checkinFeeAmount(3), 30);
  assert.equal(checkinFeeTitle(2), "Enregistrement (2 passagers)");
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
  assert.ok(findExtra(items, "chauffeur", "departure", "home"));
  assert.equal(findExtra(items, "chauffeur", "arrival", "home"), null);
  assert.equal(
    extraPlaceOf({ kind: "chauffeur", details: { service_leg: "arrival" } }),
    "hotel"
  );
});

test("le domicile encadre le vol, l’hôtel s’ajoute, le greeter est juste avant l’avion", () => {
  const outbound = {
    id: "out",
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
    id: "in",
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
  const bare = itineraryOffers([outbound, inbound]);
  assert.deepEqual(
    bare.map((offer) => `${offer.kind}:${offer.place || "greet"}:${offer.route}`),
    [
      "chauffeur:home:Domicile → ORY",
      "greeter:greet:Aéroport ORY · Paris",
      "greeter:greet:Aéroport TLV · Tel Aviv",
      "chauffeur:home:ORY → Domicile",
    ]
  );
  assert.equal(bare[0].flightLine, "Prise en charge 09h00 · Vol TO 3458 · départ 11h30");
  assert.equal(bare[0].whenIso, "2026-12-14T09:00:00");
  assert.equal(bare[0].slot, "before");
  assert.equal(bare[1].flightLine, "Vol TO 3458 · départ 11h30");
  assert.equal(bare[1].slot, "before");
  assert.equal(bare[3].flightLine, "Vol TO 3451 · arrivée 18h25");
  assert.equal(bare[3].slot, "after");
  assert.equal(bare[3].whenIso, "2026-12-23 18:25:00+00");

  const hotel = {
    kind: "hotel",
    title: "The Norman",
    end_at: "2026-12-23",
    details: { hotel_name: "The Norman", city: "Tel Aviv", address: "23 Rothschild" },
  };
  assert.deepEqual(matchedStay([hotel, inbound], "Tel Aviv"), {
    name: "The Norman",
    address: "The Norman, 23 Rothschild, Tel Aviv",
  });
  const withHotel = itineraryOffers([outbound, inbound, hotel]);
  assert.deepEqual(
    withHotel.map((offer) => `${offer.kind}:${offer.place || "greet"}:${offer.route}`),
    [
      "chauffeur:home:Domicile → ORY",
      "greeter:greet:Aéroport ORY · Paris",
      "chauffeur:hotel:The Norman → TLV",
      "greeter:greet:Aéroport TLV · Tel Aviv",
      "chauffeur:home:ORY → Domicile",
    ]
  );
  assert.equal(withHotel.some((offer) => offer.route.startsWith("TLV →")), false);
  assert.equal(withHotel[2].address, "The Norman, 23 Rothschild, Tel Aviv");
  assert.equal(withHotel[2].flightLine, "Prise en charge 11h40 · Vol TO 3451 · départ 14h10");
  assert.equal(withHotel[2].whenIso, "2026-12-23T11:40:00");
  assert.equal(withHotel[2].slot, "before");

  const oneWay = itineraryOffers([outbound]);
  assert.deepEqual(
    oneWay.map((offer) => `${offer.kind}:${offer.place || "greet"}`),
    ["chauffeur:home", "greeter:greet"]
  );
  const placed = composeItineraryDay("2026-12-14", [outbound], withHotel);
  assert.deepEqual(
    placed.map((row) => (row.type === "offer" ? row.offer.route : "VOL")),
    ["Domicile → ORY", "Aéroport ORY · Paris", "VOL"]
  );
  const back = composeItineraryDay("2026-12-23", [inbound], withHotel);
  assert.deepEqual(
    back.map((row) => (row.type === "offer" ? row.offer.route : "VOL")),
    ["The Norman → TLV", "Aéroport TLV · Tel Aviv", "VOL", "ORY → Domicile"]
  );
});

test("chauffeur et greeter seulement s’il y a un vol", () => {
  assert.equal(bookingHasFlight([]), false);
  assert.equal(bookingHasFlight([{ kind: "hotel" }]), false);
  assert.equal(bookingHasFlight([{ kind: "flight" }]), true);
  assert.equal(extraFlightAt([{ kind: "hotel", start_at: "2026-08-12" }], "departure", "2026-08-01"), null);
});
