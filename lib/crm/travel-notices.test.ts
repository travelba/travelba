import assert from "node:assert/strict";
import test from "node:test";
import { flightNoticeKey } from "./push-copy";
import { inQuietHours, planTravelNotices, type TravelFlight } from "./travel-notices";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";

function flight(patch: Partial<TravelFlight> = {}): TravelFlight {
  return {
    id: "flight-1",
    bookingId: BOOKING,
    customerId: CUSTOMER,
    reference: "TB-2026-0042",
    startAt: "2026-06-16T10:00:00",
    origin: "CDG",
    zone: "Europe/Paris",
    details: { flight_number: "AF 430", from: "CDG", to: "TLV", city_from: "Paris", city_to: "Tel Aviv" },
    status: "scheduled",
    gate: "",
    notifiedGate: "",
    notifiedOut: "",
    estimatedOut: "",
    checkinNotifiedAt: "",
    ...patch,
  };
}

const day = new Date("2026-06-15T08:00:00.000Z");

test("les heures calmes sont celles de Paris, hiver comme été", () => {
  assert.equal(inQuietHours(new Date("2026-01-15T21:30:00.000Z")), true);
  assert.equal(inQuietHours(new Date("2026-07-15T20:30:00.000Z")), true);
  assert.equal(inQuietHours(new Date("2026-01-15T06:30:00.000Z")), true);
  assert.equal(inQuietHours(day), false);
});

test("la journée prépare l’enregistrement, la porte, le retard, le départ et le solde", () => {
  const plan = planTravelNotices({
    now: day,
    prefs: null,
    flights: [
      flight({ gate: "B12", notifiedGate: "A4" }),
      flight({
        id: "flight-2",
        status: "delayed",
        estimatedOut: "2026-06-16T14:20:00",
        notifiedOut: "2026-06-16T10:00:00",
        startAt: "2026-06-16T10:00:00",
      }),
    ],
    transfers: [{ bookingId: BOOKING, title: "Maison", startAt: "2026-06-16T10:30:00" }],
    balances: [
      {
        customerId: CUSTOMER,
        bookingId: BOOKING,
        reference: "TB-2026-0042",
        departsOn: "2026-06-20",
        owed: 240,
        currency: "EUR",
      },
    ],
  });
  const titles = plan.notices.map((notice) => notice.title);
  assert.ok(titles.includes("Porte d’embarquement"));
  assert.ok(titles.includes("Vol retardé"));
  assert.ok(titles.includes("Enregistrement"));
  assert.ok(titles.includes("Départ demain"));
  assert.ok(titles.includes("Reste à régler"));
  const depart = plan.notices.find((notice) => notice.title === "Départ demain");
  assert.match(depart?.body || "", /10h30/);
  assert.match(depart?.body || "", /Maison/);
  const delay = plan.notices.find((notice) => notice.title === "Vol retardé");
  assert.equal(delay?.idempotencyKey, flightNoticeKey("flight-2", "retard", "2026-06-16T10:00:00"));
  assert.equal(plan.notices.some((notice) => /passeport|12AB34567/i.test(notice.body)), false);
});

test("la nuit retient le départ et le solde, pas un vol qui part dans l’heure", () => {
  const night = new Date("2026-06-15T21:30:00.000Z");
  const soon = planTravelNotices({
    now: night,
    prefs: null,
    flights: [
      flight({
        startAt: "2026-06-16T00:30:00",
        status: "delayed",
        estimatedOut: "2026-06-16T01:10:00",
        notifiedOut: "",
        gate: "C3",
        notifiedGate: "C1",
      }),
    ],
    transfers: [],
    balances: [
      {
        customerId: CUSTOMER,
        bookingId: BOOKING,
        reference: "TB-2026-0042",
        departsOn: "2026-06-16",
        owed: 80,
        currency: "EUR",
      },
    ],
  });
  assert.equal(soon.notices.some((notice) => notice.title === "Départ demain"), false);
  assert.equal(soon.notices.some((notice) => notice.title === "Reste à régler"), false);
  assert.ok(soon.notices.some((notice) => notice.title === "Vol retardé" || notice.title === "Porte d’embarquement"));

  const later = planTravelNotices({
    now: night,
    prefs: { push_checkin: false, push_flight_change: false, push_departure: false, push_balance: false },
    flights: [flight()],
    transfers: [],
    balances: [
      {
        customerId: CUSTOMER,
        bookingId: BOOKING,
        reference: "TB-2026-0042",
        departsOn: "2026-06-20",
        owed: 80,
        currency: "EUR",
      },
    ],
  });
  assert.equal(later.notices.length, 0);
});

test("une première porte est retenue sans message, un vol sans numéro non plus", () => {
  const plan = planTravelNotices({
    now: day,
    prefs: { push_travel: false },
    flights: [flight({ gate: "A1", notifiedGate: "" })],
    transfers: [],
    balances: [],
  });
  assert.equal(plan.notices.length, 0);
  assert.deepEqual(plan.gates, [{ itemId: "flight-1", gate: "A1", silent: true }]);
});
