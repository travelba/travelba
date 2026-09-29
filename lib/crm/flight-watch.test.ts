import assert from "node:assert/strict";
import test from "node:test";
import {
  AEROAPI_DAILY_CALL_CAP,
  aeroFlightUrl,
  airportLocalIso,
  applyAeroFlight,
  checkinOpen,
  flightIdent,
  flightNoticeDrafts,
  flightNoticeVariables,
  flightWatchBadge,
  matchAeroFlight,
  parseAeroFlights,
  pendingFlightNotices,
  pollDue,
  reserveAeroBudget,
  welcomePlace,
  type AeroFlight,
  type FlightCard,
} from "./flight-watch";

const NOW = new Date("2026-09-29T10:00:00.000Z");

function card(partial: Partial<FlightCard> = {}): FlightCard {
  return {
    kind: "flight",
    start_at: "2026-09-29T14:00:00",
    end_at: "2026-09-29T16:30:00",
    details: {
      airline_iata: "AF",
      flight_number: "AF 1789",
      from: "CDG",
      to: "RAK",
    },
    ...partial,
  };
}

function aero(partial: Partial<AeroFlight> = {}): AeroFlight {
  return {
    ident: "AF1789",
    faFlightId: "AFR1789-1",
    cancelled: false,
    diverted: false,
    status: "Scheduled",
    scheduledOut: "2026-09-29T12:00:00Z",
    estimatedOut: "2026-09-29T12:00:00Z",
    actualOut: null,
    scheduledIn: "2026-09-29T14:30:00Z",
    estimatedIn: "2026-09-29T14:30:00Z",
    departureDelay: 0,
    originIata: "CDG",
    destinationIata: "RAK",
    originTimezone: "Europe/Paris",
    destinationTimezone: "Africa/Casablanca",
    gateOrigin: "K",
    terminalOrigin: "2E",
    ...partial,
  };
}

test("le numéro de vol devient l’ident AeroAPI", () => {
  assert.equal(flightIdent({ flight_number: "AF 1789" }), "AF1789");
  assert.equal(flightIdent({ flight_number: "vol du soir" }), null);
});

test("l’heure UTC devient l’heure locale de l’aéroport", () => {
  assert.equal(airportLocalIso("2026-09-29T10:00:00Z", "Europe/Paris"), "2026-09-29T12:00:00");
  assert.equal(airportLocalIso("2026-09-29T10:00:00Z", ""), null);
});

test("un statut annulé met à jour la carte sans effacer l’heure", () => {
  const patch = applyAeroFlight(card(), aero({ status: "Cancelled", cancelled: true }), NOW);
  assert.equal(patch.event, "annule");
  assert.equal(patch.start_at, "2026-09-29T14:00:00");
  assert.equal(flightWatchBadge({ ...card(), details: patch.details }, NOW), "Annulé");
});

test("le booléen cancelled seul n’annonce pas une annulation compagnie", () => {
  const patch = applyAeroFlight(card(), aero({ status: "Scheduled", cancelled: true }), NOW);
  assert.equal(patch.event, null);
  assert.notEqual((patch.details.flight_watch as { status: string }).status, "cancelled");
});

test("un décalage d’au moins 15 minutes devient le nouvel horaire", () => {
  const patch = applyAeroFlight(
    card(),
    aero({
      estimatedOut: "2026-09-29T12:40:00Z",
      departureDelay: 40 * 60,
      status: "Delayed",
    }),
    NOW
  );
  assert.equal(patch.start_at, "2026-09-29T14:40:00");
  assert.equal(patch.event, "retard");
  const watch = patch.details.flight_watch as { sold_out: string; phrase: string };
  assert.equal(watch.sold_out, "2026-09-29T14:00:00");
  assert.equal(watch.phrase, "Delayed");
  assert.equal(flightWatchBadge({ ...card(), start_at: patch.start_at, details: patch.details }, NOW), "Retard");
});

test("cinq minutes de retard laissent l’heure vendue", () => {
  const patch = applyAeroFlight(
    card(),
    aero({ estimatedOut: "2026-09-29T12:05:00Z", departureDelay: 5 * 60 }),
    NOW
  );
  assert.equal(patch.start_at, "2026-09-29T14:00:00");
  assert.equal(patch.event, null);
});

test("le vol retenu est celui de la route, pas un autre AF1789", () => {
  const other = aero({
    faFlightId: "autre",
    originIata: "ORY",
    destinationIata: "LIS",
    scheduledOut: "2026-09-29T12:10:00Z",
  });
  assert.equal(matchAeroFlight(card(), [other, aero()])?.faFlightId, "AFR1789-1");
  assert.equal(matchAeroFlight(card({ details: { flight_number: "AF 1789" } }), [aero()]), null);
});

test("l’enregistrement Air France s’ouvre 30 h avant, pas pour une compagnie inconnue", () => {
  const start = "2026-10-02T12:00:00Z";
  const open = card({ start_at: start, details: { airline_iata: "AF", flight_number: "AF 1", from: "CDG", to: "JFK" } });
  assert.equal(checkinOpen(open, new Date("2026-10-01T06:00:00Z")), true);
  assert.equal(checkinOpen(open, new Date("2026-10-01T05:59:00Z")), false);
  assert.equal(
    checkinOpen(card({ start_at: start, details: { airline: "Corsair", flight_number: "SS 1", from: "ORY", to: "PTP" } }), new Date("2026-10-01T06:00:00Z")),
    false
  );
  assert.equal(flightWatchBadge(open, new Date("2026-10-01T06:00:00Z")), "Enregistrement ouvert");
});

test("le plafond du jour s’arrête à 200 appels et repart le lendemain", () => {
  const blocked = reserveAeroBudget({ day: "2026-09-29", calls: AEROAPI_DAILY_CALL_CAP }, NOW);
  assert.equal(blocked.ok, false);
  const next = reserveAeroBudget({ day: "2026-09-29", calls: AEROAPI_DAILY_CALL_CAP }, new Date("2026-09-29T22:30:00Z"));
  assert.equal(next.ok, true);
  assert.equal(next.extra.day, "2026-09-30");
  assert.equal(next.extra.calls, 1);
});

test("un vol déjà contrôlé récemment n’est pas rappelé", () => {
  const fresh = card({
    details: {
      flight_number: "AF 1789",
      from: "CDG",
      to: "RAK",
      flight_watch: { checked_at: "2026-09-29T09:30:00.000Z", status: "scheduled" },
    },
  });
  assert.equal(pollDue(fresh, NOW), false);
  const stale = card({
    start_at: "2026-09-29T11:00:00Z",
    details: {
      flight_number: "AF 1789",
      from: "CDG",
      to: "RAK",
      flight_watch: { checked_at: "2026-09-29T08:00:00.000Z", status: "scheduled" },
    },
  });
  assert.equal(pollDue(stale, NOW), true);
});

test("l’appel AeroAPI reste sur une page et l’en-tête n’est pas dans l’URL", () => {
  const url = aeroFlightUrl("AF1789", NOW);
  assert.equal(url.pathname, "/aeroapi/flights/AF1789");
  assert.equal(url.searchParams.get("max_pages"), "1");
  assert.equal(url.searchParams.has("x-apikey"), false);
});

test("la réponse AeroAPI ne garde que le statut utile", () => {
  const flights = parseAeroFlights({
    flights: [
      {
        ident: "AFR1789",
        ident_iata: "AF1789",
        fa_flight_id: "id",
        status: "Scheduled",
        cancelled: false,
        diverted: false,
        scheduled_out: "2026-09-29T12:00:00Z",
        origin: { code_iata: "CDG", timezone: "Europe/Paris" },
        destination: { code_iata: "RAK", timezone: "Africa/Casablanca" },
        gate_origin: "K",
        registration: "F-HZUA",
      },
    ],
  });
  assert.equal(flights.length, 1);
  assert.equal(flights[0].originIata, "CDG");
  assert.equal("registration" in flights[0], false);
});

test("les variables WhatsApp refusent un lien dans le texte", () => {
  assert.deepEqual(
    flightNoticeVariables({
      kind: "horaire",
      flight: "AF 1789",
      route: "CDG → RAK",
      when: "14h40",
      buttonSuffix: "c/23456789",
    }),
    { "1": "AF 1789", "2": "CDG → RAK", "3": "14h40", "4": "c/23456789" }
  );
  assert.equal(
    flightNoticeVariables({
      kind: "annule",
      flight: "AF 1789",
      route: "https://travelba.fr",
      buttonSuffix: "c/23456789",
    }),
    null
  );
  assert.equal(flightNoticeDrafts().map((draft) => draft.env).join(","), [
    "TWILIO_CONTENT_VOL_ANNULE",
    "TWILIO_CONTENT_VOL_HORAIRE",
    "TWILIO_CONTENT_VOL_ENREGISTREMENT",
    "TWILIO_CONTENT_VOL_RETARD",
    "TWILIO_CONTENT_VOL_DEROUTE",
    "TWILIO_CONTENT_VOL_ENVOL",
    "TWILIO_CONTENT_VOL_ARRIVEE",
  ].join(","));
  assert.deepEqual(
    flightNoticeVariables({
      kind: "arrivee",
      flight: "",
      route: "",
      place: "à Marrakech",
      buttonSuffix: "c/23456789",
    }),
    { "1": "à Marrakech", "2": "c/23456789" }
  );
});

test("décollage, arrivée et déroutement ont chacun leur message", () => {
  const airborne = applyAeroFlight(card(), aero({ status: "En Route / On Time" }), NOW);
  assert.equal(airborne.event, "envol");
  assert.equal(flightWatchBadge({ ...card(), details: airborne.details }, NOW), "En vol");

  const landed = applyAeroFlight(card(), aero({ status: "Arrived / Gate Arrival" }), NOW);
  assert.deepEqual(pendingFlightNotices({ ...card(), details: landed.details }), ["arrivee"]);
  assert.equal(flightWatchBadge({ ...card(), details: landed.details }, NOW), "Arrivé");

  const diverted = applyAeroFlight(card(), aero({ status: "Diverted", diverted: true, destinationIata: "CMN" }), NOW);
  assert.equal(diverted.event, "deroute");
  assert.equal(flightWatchBadge({ ...card(), details: diverted.details }, NOW), "Dérouté");
});

test("la bienvenue vise la ville, sinon le pays", () => {
  assert.equal(welcomePlace({ city: "Marrakech", country: "Maroc" }), "à Marrakech");
  assert.equal(welcomePlace({ city: "Le Caire" }), "au Caire");
  assert.equal(welcomePlace({ country: "Maroc" }), "au Maroc");
  assert.equal(welcomePlace({ country: "France" }), "en France");
  assert.equal(welcomePlace({ country: "États-Unis" }), "aux États-Unis");
  assert.equal(welcomePlace({ country: "Israël" }), "en Israël");
  assert.equal(welcomePlace({}), null);
});
