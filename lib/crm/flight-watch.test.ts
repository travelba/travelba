import assert from "node:assert/strict";
import test from "node:test";
import {
  AEROAPI_DAILY_CALL_CAP,
  aeroFlightUrl,
  aeroQueryRange,
  airportLocalIso,
  applyAeroFlight,
  explainAeroMatch,
  flightDesignators,
  checkinOpen,
  flightIdent,
  flightNoticeDrafts,
  flightNoticeVariables,
  flightWatchBadge,
  matchAeroFlight,
  parseAeroFlights,
  pendingFlightNotices,
  pollDue,
  pollIntervalMs,
  capDueGroups,
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
    actualOff: null,
    scheduledIn: "2026-09-29T14:30:00Z",
    estimatedIn: "2026-09-29T14:30:00Z",
    actualIn: null,
    departureDelay: 0,
    originIata: "CDG",
    originIcao: "LFPG",
    destinationIata: "RAK",
    destinationIcao: "GMMX",
    originTimezone: "Europe/Paris",
    destinationTimezone: "Africa/Casablanca",
    gateOrigin: "K",
    terminalOrigin: "2E",
    gateDestination: "",
    terminalDestination: "",
    baggageClaim: "",
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
    originIcao: "LFPO",
    destinationIata: "LIS",
    destinationIcao: "LPPT",
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
  assert.equal(flightWatchBadge(open, new Date("2026-10-01T06:00:00Z"), "fait"), "Enregistré");
  assert.equal(flightWatchBadge(open, new Date("2026-10-01T06:00:00Z"), "cartes_recues"), "Cartes d’embarquement prêtes");
  assert.equal(flightWatchBadge(open, new Date("2026-10-01T06:00:00Z"), "envoyees"), "Cartes d’embarquement prêtes");
  assert.equal(flightWatchBadge(open, new Date("2026-10-01T05:00:00Z"), "ouvert"), "Enregistrement ouvert");
  const late = card({
    details: {
      airline_iata: "AF",
      flight_number: "AF 1789",
      from: "CDG",
      to: "RAK",
      flight_watch: { status: "delayed" },
    },
  });
  assert.equal(flightWatchBadge(late, NOW, "cartes_recues"), "Retard");
  const cancelled = card({
    details: {
      airline_iata: "AF",
      flight_number: "AF 1789",
      from: "CDG",
      to: "RAK",
      flight_watch: { status: "cancelled" },
    },
  });
  assert.equal(flightWatchBadge(cancelled, NOW, "fait"), "Annulé");
});

test("Lufthansa ouvre l’enregistrement 23 h avant", () => {
  const start = "2026-10-02T12:00:00Z";
  const lh = card({ start_at: start, details: { airline_iata: "LH", flight_number: "LH 400", from: "FRA", to: "CDG" } });
  assert.equal(checkinOpen(lh, new Date("2026-10-01T13:00:00Z")), true);
  assert.equal(checkinOpen(lh, new Date("2026-10-01T12:59:00Z")), false);
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
  assert.equal(url.searchParams.get("ident_type"), "designator");
  assert.equal(url.searchParams.get("max_pages"), "1");
  assert.equal(url.searchParams.has("x-apikey"), false);
  const start = Date.parse(url.searchParams.get("start") || "");
  const end = Date.parse(url.searchParams.get("end") || "");
  assert.ok(start < NOW.getTime() && end > NOW.getTime());
});

test("la fenêtre entoure la date du vol et reste dans les bornes AeroAPI", () => {
  const now = new Date("2026-11-11T08:00:00.000Z");
  const anchor = new Date("2026-11-11T12:48:00.000Z");
  const range = aeroQueryRange(anchor, anchor, now);
  assert.ok(range.start.getTime() <= anchor.getTime());
  assert.ok(range.end.getTime() > anchor.getTime());
  assert.ok(range.start.getTime() >= now.getTime() - 10 * 24 * 60 * 60 * 1000);
  assert.ok(range.end.getTime() <= now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const late = new Date(now.getTime() + 40 * 60 * 60 * 1000);
  const clamped = aeroQueryRange(late, late, now);
  assert.ok(clamped.end.getTime() <= now.getTime() + 2 * 24 * 60 * 60 * 1000);
  assert.ok(clamped.end.getTime() > late.getTime());
});

test("AF7308 est cherché en IATA puis en ICAO", () => {
  assert.deepEqual(flightDesignators({ flight_number: "AF 7308" }), ["AF7308", "AFR7308"]);
  assert.deepEqual(flightDesignators({ flight_number: "AFR7308" }), ["AFR7308"]);
  assert.deepEqual(flightDesignators({ flight_number: "ZZ 9" }), ["ZZ9"]);
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
  const bodies = flightNoticeDrafts()
    .map((draft) => {
      const card = draft.create.types["twilio/call-to-action"] as { body?: string };
      return card.body || "";
    })
    .join("\n");
  assert.match(bodies, /transmets/);
  assert.match(bodies, /Je vous souhaite un bon vol/);
  assert.match(bodies, /Vous voici/);
  assert.equal(bodies.includes("L'agence s'en occupe"), false);
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

const TEN_MIN = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

test("à 3 h du départ la relecture passe à 10 minutes, au-delà elle reste à 4 h puis 12 h", () => {
  assert.equal(pollIntervalMs("2026-09-29T13:00:00.000Z", NOW), TEN_MIN);
  assert.equal(pollIntervalMs("2026-09-29T13:01:00.000Z", NOW), 4 * HOUR);
  assert.equal(pollIntervalMs("2026-09-29T22:00:00.000Z", NOW), 4 * HOUR);
  assert.equal(pollIntervalMs("2026-09-29T22:01:00.000Z", NOW), 12 * HOUR);

  const recent = card({
    start_at: "2026-09-29T13:00:00.000Z",
    details: {
      flight_number: "AF 1789",
      from: "CDG",
      to: "RAK",
      flight_watch: { status: "scheduled", checked_at: "2026-09-29T09:51:00.000Z" },
    },
  });
  assert.equal(pollDue(recent, NOW), false);
  const due = card({
    ...recent,
    details: {
      ...recent.details,
      flight_watch: { status: "scheduled", checked_at: "2026-09-29T09:49:00.000Z" },
    },
  });
  assert.equal(pollDue(due, NOW), true);
});

test("un retard au sol garde les 10 minutes tant que l’avion n’a pas décollé", () => {
  const held = card({
    start_at: "2026-09-29T09:00:00.000Z",
    details: {
      flight_number: "AF 1789",
      from: "CDG",
      to: "RAK",
      flight_watch: {
        status: "delayed",
        scheduled_out: "2026-09-29T09:00:00.000Z",
        estimated_out: "2026-09-29T11:00:00.000Z",
        checked_at: "2026-09-29T09:49:00.000Z",
      },
    },
  });
  assert.equal(pollDue(held, NOW), true);
  const fresh = card({
    ...held,
    details: {
      ...held.details,
      flight_watch: {
        status: "delayed",
        scheduled_out: "2026-09-29T09:00:00.000Z",
        estimated_out: "2026-09-29T11:00:00.000Z",
        checked_at: "2026-09-29T09:51:00.000Z",
      },
    },
  });
  assert.equal(pollDue(fresh, NOW), false);
});

test("en vol, pas de relecture avant l’arrivée estimée, puis une seule de secours", () => {
  const airborne = card({
    start_at: "2026-09-29T09:00:00.000Z",
    end_at: "2026-09-29T12:00:00.000Z",
    details: {
      flight_number: "AF 1789",
      from: "CDG",
      to: "RAK",
      flight_watch: {
        status: "en_route",
        actual_out: "2026-09-29T09:05:00.000Z",
        estimated_in: "2026-09-29T12:00:00.000Z",
        checked_at: "2026-09-29T09:50:00.000Z",
      },
    },
  });
  assert.equal(pollDue(airborne, NOW), false);
  assert.equal(pollDue(airborne, new Date("2026-09-29T12:09:00.000Z")), false);
  assert.equal(pollDue(airborne, new Date("2026-09-29T12:10:00.000Z")), true);

  const afterArrival = card({
    ...airborne,
    details: {
      ...airborne.details,
      flight_watch: {
        status: "en_route",
        actual_out: "2026-09-29T09:05:00.000Z",
        estimated_in: "2026-09-29T12:00:00.000Z",
        checked_at: "2026-09-29T12:10:00.000Z",
      },
    },
  });
  assert.equal(pollDue(afterArrival, new Date("2026-09-29T12:20:00.000Z")), false);
  assert.equal(pollDue(afterArrival, new Date("2026-09-29T13:10:00.000Z")), true);

  const afterBackup = card({
    ...airborne,
    details: {
      ...airborne.details,
      flight_watch: {
        status: "en_route",
        actual_out: "2026-09-29T09:05:00.000Z",
        estimated_in: "2026-09-29T12:00:00.000Z",
        checked_at: "2026-09-29T13:10:00.000Z",
      },
    },
  });
  assert.equal(pollDue(afterBackup, new Date("2026-09-29T16:00:00.000Z")), false);
});

test("un vol atterri et déjà annoncé n’est plus relu", () => {
  const landed = card({
    start_at: "2026-09-29T08:00:00.000Z",
    end_at: "2026-09-29T09:30:00.000Z",
    details: {
      flight_number: "AF 1789",
      from: "CDG",
      to: "RAK",
      flight_watch: {
        status: "landed",
        notified_arrival: true,
        actual_out: "2026-09-29T08:02:00.000Z",
        estimated_in: "2026-09-29T09:30:00.000Z",
        checked_at: "2026-09-29T09:40:00.000Z",
      },
    },
  });
  assert.equal(pollDue(landed, NOW), false);
});

test("un passage ne relit pas plus de huit vols, les plus proches d’abord", () => {
  const groups = Array.from({ length: 9 }, (_, index) => {
    const hours = 20 - index;
    const item = card({
      start_at: new Date(NOW.getTime() + hours * HOUR).toISOString(),
      details: { flight_number: `AF ${1000 + index}`, from: "CDG", to: "NCE" },
    });
    return [`AF${1000 + index}`, [item]] as [string, FlightCard[]];
  });
  const kept = capDueGroups(groups, NOW);
  assert.equal(kept.length, 8);
  assert.equal(kept[0][0], "AF1008");
  assert.equal(kept.some((group) => group[0] === "AF1000"), false);
});

const AF7308 = {
  ident: "AFR7308",
  ident_icao: "AFR7308",
  ident_iata: "AF7308",
  fa_flight_id: "AFR7308-1111",
  cancelled: false,
  diverted: false,
  status: "Scheduled",
  scheduled_out: "2026-11-11T12:48:00Z",
  estimated_out: "2026-11-11T12:55:00Z",
  actual_out: null,
  actual_off: null,
  scheduled_off: "2026-11-11T13:05:00Z",
  scheduled_in: "2026-11-11T14:15:00Z",
  estimated_in: "2026-11-11T14:20:00Z",
  actual_in: null,
  departure_delay: 420,
  gate_origin: "K35",
  gate_destination: "A4",
  terminal_origin: "2F",
  terminal_destination: "1",
  baggage_claim: "2",
  origin: {
    code: "LFPG",
    code_icao: "LFPG",
    code_iata: "CDG",
    timezone: "Europe/Paris",
    name: "Paris Charles de Gaulle",
    city: "Paris",
  },
  destination: {
    code: "LFMN",
    code_icao: "LFMN",
    code_iata: "NCE",
    timezone: "Europe/Paris",
    name: "Nice Cote d'Azur",
    city: "Nice",
  },
};

function niceCard(day = "2026-11-11"): FlightCard {
  return {
    kind: "flight",
    start_at: `${day}T13:48:00`,
    end_at: `${day}T15:15:00`,
    details: { airline_iata: "AF", flight_number: "AF 7308", from: "CDG", to: "NCE" },
  };
}

test("une réponse AeroAPI type retient AF7308 CDG-NCE du bon jour", () => {
  const flights = parseAeroFlights({
    flights: [
      {
        ...AF7308,
        fa_flight_id: "AFR7308-veille",
        scheduled_out: "2026-11-10T12:48:00Z",
        estimated_out: "2026-11-10T12:48:00Z",
      },
      AF7308,
      {
        ...AF7308,
        fa_flight_id: "autre-route",
        origin: { code: "LFPG", code_icao: "LFPG", code_iata: "CDG", timezone: "Europe/Paris" },
        destination: { code: "LFPO", code_icao: "LFPO", code_iata: "ORY", timezone: "Europe/Paris" },
      },
    ],
  });
  assert.equal(flights[1].originIata, "CDG");
  assert.equal(flights[1].originIcao, "LFPG");
  assert.equal(flights[1].destinationIcao, "LFMN");
  assert.equal(flights[1].terminalDestination, "1");
  assert.equal(flights[1].gateDestination, "A4");
  assert.equal(flights[1].baggageClaim, "2");
  const explained = explainAeroMatch(niceCard(), flights);
  assert.equal(explained.note, "");
  assert.equal(explained.flight?.faFlightId, "AFR7308-1111");
  const patch = applyAeroFlight(niceCard(), explained.flight, new Date("2026-11-11T10:00:00.000Z"));
  const watch = patch.details.flight_watch as Record<string, string>;
  assert.equal(watch.fa_flight_id, "AFR7308-1111");
  assert.equal(watch.status, "scheduled");
  assert.equal(watch.terminal_origin, "2F");
  assert.equal(watch.gate_origin, "K35");
  assert.equal(watch.terminal_destination, "1");
  assert.equal(watch.gate_destination, "A4");
  assert.equal(watch.baggage_claim, "2");
  assert.equal(watch.scheduled_out, "2026-11-11T13:48:00");
  assert.equal(watch.estimated_out, "2026-11-11T13:55:00");
  assert.equal(watch.scheduled_in, "2026-11-11T15:15:00");
  assert.equal(watch.estimated_in, "2026-11-11T15:20:00");
  assert.equal(watch.actual_in, "");
  assert.equal(watch.last_error, "");
  assert.equal(watch.match_note, "");
  assert.equal(patch.details.terminal, "2F");
  assert.equal(patch.details.gate, "K35");
});

test("LFPG et LFMN seuls rapprochent encore CDG et NCE", () => {
  const flights = parseAeroFlights({
    flights: [
      {
        ident: "AFR7308",
        ident_icao: "AFR7308",
        fa_flight_id: "icao-seul",
        status: "Scheduled",
        scheduled_out: "2026-11-11T12:48:00Z",
        scheduled_in: "2026-11-11T14:15:00Z",
        origin: { code: "LFPG", code_icao: "LFPG", timezone: "Europe/Paris" },
        destination: { code: "LFMN", code_icao: "LFMN", timezone: "Europe/Paris" },
        terminal_origin: "2F",
        gate_origin: "K35",
      },
    ],
  });
  assert.equal(flights[0].originIata, "");
  assert.equal(flights[0].originIcao, "LFPG");
  assert.equal(explainAeroMatch(niceCard(), flights).flight?.faFlightId, "icao-seul");
});

test("une mauvaise date ou une autre route explique le refus", () => {
  const flights = parseAeroFlights({ flights: [AF7308] });
  assert.equal(explainAeroMatch(niceCard("2026-11-12"), flights).note, "mauvaise date");
  const elsewhere = parseAeroFlights({
    flights: [
      {
        ...AF7308,
        destination: { code: "LFPO", code_icao: "LFPO", code_iata: "ORY", timezone: "Europe/Paris" },
      },
    ],
  });
  assert.equal(explainAeroMatch(niceCard(), elsewhere).note, "autre arrivee");
  assert.equal(explainAeroMatch(niceCard(), []).note, "aucun vol");
});

test("sans vol retenu, la raison courte est stockée", () => {
  const patch = applyAeroFlight(niceCard(), null, new Date("2026-11-11T10:00:00.000Z"), {
    note: "aucun vol",
    error: "http 404",
  });
  const watch = patch.details.flight_watch as Record<string, string>;
  assert.equal(watch.match_note, "aucun vol");
  assert.equal(watch.last_error, "http 404");
  assert.equal(watch.fa_flight_id, "");
  assert.equal(watch.checked_at, "2026-11-11T10:00:00.000Z");
  assert.equal(patch.start_at, "2026-11-11T13:48:00");
});

