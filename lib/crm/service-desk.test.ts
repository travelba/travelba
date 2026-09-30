import assert from "node:assert/strict";
import test from "node:test";
import { serviceCancelLocked } from "./extras";
import { checkinAttemptDue } from "./flight-watch";
import { checkinDeskNote, serviceDeskLines, type ServiceDeskItem } from "./service-desk";

const now = new Date("2026-12-01T10:00:00Z");

const outbound: ServiceDeskItem = {
  id: "out",
  booking_id: "b1",
  kind: "flight",
  start_at: "2026-12-14T11:30:00+00:00",
  end_at: "2026-12-14T17:10:00+00:00",
  details: {
    from: "ORY",
    to: "TLV",
    city_from: "Paris",
    city_to: "Tel Aviv",
    flight_number: "TO 3458",
    airline_iata: "TO",
  },
};

const booking = { id: "b1", reference: "TB-1", status: "confirmed", customer_id: "c1" };

test("la file reprend transfert, VIP et enregistrement encore ouverts", () => {
  const lines = serviceDeskLines({
    now,
    names: { c1: "Ada Martin" },
    bookings: [booking, { id: "gone", reference: "TB-X", status: "cancelled", customer_id: "c1" }],
    items: [
      outbound,
      {
        id: "car",
        booking_id: "b1",
        kind: "chauffeur",
        title: "Transfert aller",
        start_at: "2026-12-14T09:00:00",
        details: {
          service_leg: "departure",
          place: "home",
          pickup: "12 rue de Rivoli, Paris",
          agency_status: "pending",
          extra: true,
        },
      },
      {
        id: "vip",
        booking_id: "b1",
        kind: "greeter",
        start_at: "2026-12-14T11:30:00+00:00",
        details: { service_leg: "departure", moment: "depart", adults: 2, children: 1, agency_status: "pending" },
      },
      {
        id: "done-vip",
        booking_id: "b1",
        kind: "greeter",
        details: { service_leg: "departure", moment: "arrive", agency_status: "confirmed" },
      },
      {
        id: "check",
        booking_id: "b1",
        kind: "checkin",
        details: { extra: true, passengers: 2 },
      },
      {
        id: "cancelled-car",
        booking_id: "gone",
        kind: "chauffeur",
        details: { service_leg: "departure", place: "home", agency_status: "pending" },
      },
    ],
  });
  assert.deepEqual(
    lines.map((line) => line.kindLabel),
    ["Transfert", "VIP Airport", "Enregistrement"]
  );
  assert.equal(lines[0].holderName, "Ada Martin");
  assert.equal(lines[0].reference, "TB-1");
  assert.match(lines[0].detail, /Domicile → ORY/);
  assert.match(lines[0].detail, /Départ 12 rue de Rivoli, Paris/);
  assert.match(lines[0].detail, /Arrivée ORY · Paris/);
  assert.match(lines[0].detail, /Vol TO 3458/);
  assert.match(lines[1].detail, /ORY · Paris/);
  assert.match(lines[1].detail, /départ/);
  assert.match(lines[1].detail, /2 adultes · 1 enfant/);
  assert.equal(lines[2].later, true);
  assert.match(lines[2].detail, /^dès le /);
  assert.equal(lines.every((line) => line.bookingId === "b1"), true);
});

test("l’enregistrement sans fenêtre connue est là, sans heure", () => {
  const note = checkinDeskNote(
    [{ start_at: "2026-12-14T11:30:00Z", details: { flight_number: "SS 1", airline: "Corsair" } }],
    now
  );
  assert.equal(note, null);
  const lines = serviceDeskLines({
    now,
    names: {},
    bookings: [{ ...booking, status: "draft" }],
    items: [
      {
        id: "flight",
        booking_id: "b1",
        kind: "flight",
        start_at: "2026-12-14T11:30:00Z",
        details: { flight_number: "SS 1" },
      },
      { id: "check", booking_id: "b1", kind: "checkin", details: { extra: true } },
    ],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].detail, "");
  assert.equal(lines[0].later, false);
  assert.equal(lines[0].holderName, "Client");
});

test("la fenêtre déjà ouverte se dit ouverte", () => {
  assert.equal(
    checkinDeskNote([outbound], new Date("2026-12-13T06:00:00Z")),
    "ouvert"
  );
});

test("un service confirmé ne s’annule plus, une demande en attente si", () => {
  assert.equal(serviceCancelLocked("checkin", { details: {} }), false);
  assert.equal(serviceCancelLocked("checkin", { details: { agency_status: "pending" } }), false);
  assert.equal(serviceCancelLocked("chauffeur", { details: { agency_status: "pending" } }), false);
  assert.equal(serviceCancelLocked("checkin", { details: { agency_status: "confirmed" } }), true);
  assert.equal(serviceCancelLocked("greeter", { details: { agency_status: "confirmed" } }), true);
  assert.equal(serviceCancelLocked("visa", { details: { agency_status: "confirmed" } }), false);
});

test("l’enregistrement confié à l’agence ne déclenche pas « présentez-vous »", () => {
  const item = {
    id: "f",
    booking_id: "b1",
    kind: "flight",
    start_at: "2026-12-14T11:30:00Z",
    end_at: null,
    details: { airline_iata: "TO", flight_number: "TO 3458", from: "ORY", to: "TLV" },
  };
  const open = new Date("2026-12-13T06:00:00Z");
  assert.equal(checkinAttemptDue(item, open, false), true);
  assert.equal(checkinAttemptDue(item, open, true), false);
});
