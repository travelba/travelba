import assert from "node:assert/strict";
import test from "node:test";
import {
  airportPushCopy,
  boardingPushCopy,
  flightPushCopy,
  paymentPushCopy,
  pushAllowed,
} from "./push-copy";

test("un vol sans numéro ne part pas, les autres phrases restent courtes", () => {
  assert.equal(flightPushCopy({ kind: "horaire", flight: "", route: "CDG → JFK", when: "14h20" }), null);
  assert.deepEqual(flightPushCopy({ kind: "horaire", flight: "EX 100", route: "CDG → JFK", when: "14h20" }), {
    title: "Horaire de vol",
    body: "Votre vol EX 100 CDG → JFK part désormais à 14h20.",
  });
  assert.match(flightPushCopy({ kind: "annule", flight: "EX 100", route: "CDG → JFK" })?.body || "", /ne partira pas/);
  assert.match(flightPushCopy({ kind: "arrivee", place: "à New York" })?.body || "", /à New York/);
  assert.equal(flightPushCopy({ kind: "arrivee", place: "" }), null);
  assert.equal(boardingPushCopy({ flight: "EX 100", route: "Paris → New York" }).title, "Carte d’embarquement");
  assert.match(airportPushCopy({ flight: "EX 100" }).body, /aéroport/);
});

test("le règlement reçu ne cite le dossier que s’il a une référence", () => {
  assert.match(paymentPushCopy("1 200 €", "TB-2026-0001").body, /TB-2026-0001/);
  assert.doesNotMatch(paymentPushCopy("1 200 €", "virement famille").body, /famille/);
});

test("sans préférence, les notifications partent ; false les coupe", () => {
  assert.equal(pushAllowed(null, "travel"), true);
  assert.equal(pushAllowed({ push_travel: false }, "travel"), false);
  assert.equal(pushAllowed({ push_travel: false }, "documents"), true);
  assert.equal(pushAllowed({ push_payment: true }, "payment"), true);
  assert.equal(pushAllowed(null, "messages"), true);
  assert.equal(pushAllowed({ push_messages: false }, "messages"), false);
  assert.equal(pushAllowed({}, "messages"), true);
});
