import assert from "node:assert/strict";
import test from "node:test";
import { airportLocalIso, applyAeroFlight, type AeroFlight, type FlightCard } from "./flight-watch";
import { buildLiveFlight, flightHm, livePlaceLine } from "./next-flight-model";
import { formatCountdown, liveFlightCaption, liveFlightPhase, liveFlightProgress } from "./next-flight-live";

const NOW = Date.parse("2026-11-11T11:35:20Z");

function item(partial: Partial<Parameters<typeof buildLiveFlight>[0]> = {}) {
  return {
    supplier: "Air France",
    start_at: "2026-11-11T13:48:00",
    end_at: "2026-11-11T15:15:00",
    details: {
      airline: "Air France",
      flight_number: "AF 7308",
      from: "CDG",
      to: "NCE",
      gate: "F35",
      departure_timezone: "Europe/Paris",
      arrival_timezone: "Europe/Paris",
      flight_watch: {
        status: "scheduled",
        scheduled_out: "2026-11-11T13:48:00",
        estimated_out: "2026-11-11T13:48:00",
        scheduled_in: "2026-11-11T15:15:00",
        estimated_in: "2026-11-11T15:25:00",
      },
    },
    ...partial,
  };
}

test("une heure sans chiffres, ou minuit, ne s’affiche pas", () => {
  assert.equal(flightHm("2026-11-11T13:48:00"), "13:48");
  assert.equal(flightHm("13h15"), "13:15");
  assert.equal(flightHm("2026-11-11T00:00:00"), "");
  assert.equal(flightHm("2026-11-11"), "");
  assert.equal(livePlaceLine("", "F35", ""), "Porte F35");
  assert.equal(livePlaceLine("13:15", "F35", "2E"), "Embarquement 13:15 · Porte F35 · Terminal 2E");
  assert.equal(livePlaceLine("", "", ""), "");
});

test("avant le départ, le compte à rebours part de l’heure locale de l’aéroport", () => {
  const flight = buildLiveFlight({
    ...item(),
    details: { ...item().details, boarding_time: "13:15", terminal: "2E" },
  });
  assert.equal(flight.airline, "Air France");
  assert.equal(flight.number, "AF7308");
  assert.equal(flight.origin, "CDG");
  assert.equal(flight.destination, "NCE");
  assert.deepEqual(flight.departure, { scheduled: "13:48", revised: "" });
  assert.deepEqual(flight.arrival, { scheduled: "15:15", revised: "15:25" });
  assert.equal(flight.place, "Embarquement 13:15 · Porte F35 · Terminal 2E");
  assert.equal(flight.arrivalPrevue, "15:25");
  assert.equal(flight.departureAt, Date.parse("2026-11-11T12:48:00Z"));
  assert.equal(liveFlightPhase(flight, NOW), "before");
  assert.equal(liveFlightProgress(flight, NOW), 0);
  assert.deepEqual(liveFlightCaption(flight, NOW), { kind: "countdown", clock: "1:12:40" });
});

test("en vol, l’avion avance selon le temps écoulé et l’arrivée estimée", () => {
  const flight = buildLiveFlight({
    ...item(),
    details: {
      ...item().details,
      flight_watch: {
        status: "en_route",
        scheduled_out: "2026-11-11T13:48:00",
        estimated_out: "2026-11-11T13:48:00",
        actual_out: "2026-11-11T13:50:00",
        scheduled_in: "2026-11-11T15:15:00",
        estimated_in: "2026-11-11T15:25:00",
      },
    },
  });
  const now = Date.parse("2026-11-11T13:44:00Z");
  assert.deepEqual(flight.departure, { scheduled: "13:48", revised: "13:50" });
  assert.equal(flight.departureAt, Date.parse("2026-11-11T12:50:00Z"));
  assert.equal(flight.arrivalAt, Date.parse("2026-11-11T14:25:00Z"));
  assert.equal(liveFlightPhase(flight, now), "airborne");
  assert.ok(Math.abs(liveFlightProgress(flight, now) - 54 / 95) < 0.001);
  assert.deepEqual(liveFlightCaption(flight, now), { kind: "airborne", minutes: 41 });
});

test("un statut en vol prime sur une heure de départ encore devant", () => {
  const flight = buildLiveFlight(item());
  const early = (flight.departureAt || 0) - 60_000;
  const marked = { ...flight, status: "en_route" };
  assert.equal(liveFlightPhase(marked, early), "airborne");
  assert.equal(liveFlightProgress(marked, early), 0.06);
});

test("après l’atterrissage, l’avion est au bout et l’heure réelle est citée", () => {
  const flight = buildLiveFlight({
    ...item(),
    details: {
      ...item().details,
      flight_watch: {
        status: "landed",
        scheduled_out: "2026-11-11T13:48:00",
        actual_out: "2026-11-11T13:50:00",
        scheduled_in: "2026-11-11T15:15:00",
        estimated_in: "2026-11-11T15:25:00",
        actual_in: "2026-11-11T15:22:00",
      },
    },
  });
  assert.equal(flight.landedClock, "15:22");
  assert.equal(liveFlightPhase(flight, NOW), "landed");
  assert.equal(liveFlightProgress(flight, NOW), 1);
  assert.deepEqual(liveFlightCaption(flight, NOW), { kind: "landed", clock: "15:22" });
});

test("sans fuseau connu, pas de compte à rebours inventé", () => {
  const flight = buildLiveFlight({
    supplier: "Air France",
    start_at: "2026-11-11T13:48:00",
    end_at: "2026-11-11T15:15:00",
    details: { airline: "Air France", flight_number: "AF7308", from: "ZZZ", to: "YYY" },
  });
  assert.equal(flight.origin, "ZZZ");
  assert.equal(flight.departureAt, null);
  assert.equal(flight.arrivalAt, null);
  assert.equal(liveFlightPhase(flight, NOW), "before");
  assert.deepEqual(liveFlightCaption(flight, NOW), { kind: "plain", text: "Décollage à 13:48" });
});

test("annulé et dérouté ne lancent pas un compte à rebours", () => {
  const cancelled = buildLiveFlight({
    ...item(),
    details: { ...item().details, flight_watch: { status: "cancelled", scheduled_out: "2026-11-11T13:48:00" } },
  });
  assert.deepEqual(liveFlightCaption(cancelled, NOW), { kind: "plain", text: "Vol annulé" });
  assert.equal(liveFlightProgress(cancelled, NOW), 0);
  const diverted = { ...cancelled, status: "diverted" };
  assert.deepEqual(liveFlightCaption(diverted, NOW), { kind: "plain", text: "Vol dérouté" });
});

test("le suivi conserve l’arrivée prévue et l’heure réelle déjà reçues", () => {
  const card: FlightCard = {
    kind: "flight",
    start_at: "2026-09-29T14:00:00",
    end_at: "2026-09-29T16:30:00",
    details: { flight_number: "AF 1789", from: "CDG", to: "RAK" },
  };
  const aero: AeroFlight = {
    ident: "AF1789",
    faFlightId: "AFR1789-1",
    cancelled: false,
    diverted: false,
    status: "En Route / On Time",
    scheduledOut: "2026-09-29T12:00:00Z",
    estimatedOut: "2026-09-29T12:00:00Z",
    actualOut: "2026-09-29T12:10:00Z",
    scheduledIn: "2026-09-29T14:30:00Z",
    estimatedIn: "2026-09-29T14:45:00Z",
    actualIn: null,
    departureDelay: 0,
    originIata: "CDG",
    destinationIata: "RAK",
    originTimezone: "Europe/Paris",
    destinationTimezone: "Africa/Casablanca",
    gateOrigin: "K",
    terminalOrigin: "2E",
  };
  const patch = applyAeroFlight(card, aero, new Date("2026-09-29T10:00:00.000Z"));
  const watch = patch.details.flight_watch as Record<string, string>;
  assert.equal(watch.actual_out, airportLocalIso("2026-09-29T12:10:00Z", "Europe/Paris"));
  assert.equal(watch.scheduled_in, airportLocalIso("2026-09-29T14:30:00Z", "Africa/Casablanca"));
  assert.equal(watch.estimated_in, airportLocalIso("2026-09-29T14:45:00Z", "Africa/Casablanca"));
  assert.equal(watch.actual_in, "");
});

test("le format du compte à rebours est h:mm:ss", () => {
  assert.equal(formatCountdown((1 * 3600 + 12 * 60 + 40) * 1000), "1:12:40");
  assert.equal(formatCountdown(5 * 1000), "0:00:05");
});
