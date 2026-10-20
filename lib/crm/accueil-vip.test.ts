import assert from "node:assert/strict";
import test from "node:test";
import {
  accueilVipTitle,
  clientInfoBlocks,
  composeAccueilVip,
  placeAccueilVipBesideFlights,
  readAccueilVipLegs,
  remapAccueilVipLinks,
  withLiveAccueilVip,
  type AccueilVipFlight,
  type AccueilVipLeg,
} from "./accueil-vip";
import { bookingTotalFromItems } from "./bookings";
import { groupByDay } from "./carnet";
import { buildBookingIcs, googleCalendarHref } from "./calendar-ics";
import { tripCityPlan } from "./layover";
import { placeFromPreposition } from "./stay-phrase";
import type { CrmBooking, CrmBookingItem } from "./types";

const INFO = `Ce qui est inclus
- Arrivée le 26/12, AF956 à 5h50 : un agent Coral les attend avec une pancarte à leur nom dans le hall d'arrivée, avant l'immigration. Il les fait passer directement par la file rapide de l'immigration, puis les aide aux bagages et à la douane.
- Départ le 08/01, AF157 à 11h55 : il faut appeler la hotline environ 15 minutes avant d'arriver à l'aéroport. Un agent les attend au dépose-minute (nouveau terminal, porte 2, 3e étage). Après l'enregistrement, elles vont au comptoir Coral (rangée H, 3e étage), puis l'agent les accompagne en file rapide jusqu'à l'embarquement.
- Porteur : 2 bagages par personne, soit 4 en tout.`;

function flight(partial: Partial<AccueilVipFlight> & Pick<AccueilVipFlight, "id">): AccueilVipFlight {
  return { kind: "flight", lifecycle: "active", title: "Paris → Phuket", ...partial };
}

const ARRIVAL = flight({
  id: "af956",
  title: "Paris → Phuket",
  start_at: "2026-12-25T23:20:00",
  end_at: "2026-12-26T05:50:00",
  details: {
    flight_number: "AF956",
    from: "CDG",
    to: "HKT",
    city_from: "Paris",
    city_to: "Phuket",
    departure_timezone: "Europe/Paris",
    arrival_timezone: "Asia/Bangkok",
  },
});

const DEPARTURE = flight({
  id: "af157",
  title: "Phuket → Paris",
  start_at: "2027-01-08T11:55:00",
  end_at: "2027-01-08T19:15:00",
  details: {
    flight_number: "AF157",
    from: "HKT",
    to: "CDG",
    city_from: "Phuket",
    city_to: "Paris",
    departure_timezone: "Asia/Bangkok",
    arrival_timezone: "Europe/Paris",
  },
});

function fields(partial: Partial<Parameters<typeof composeAccueilVip>[0]> = {}) {
  return {
    service: "roundtrip" as const,
    provider: "Coral Thailand",
    arrivalFlightId: ARRIVAL.id,
    departureFlightId: DEPARTURE.id,
    passengers: 2,
    bags: 4,
    hotline: "+66 92 915 9515",
    email: "booking@coralthailand.com",
    confirmation: "PNR-021811",
    clientInfo: INFO,
    amount: null,
    ...partial,
  };
}

function cardItem(partial: Partial<CrmBookingItem>): CrmBookingItem {
  return {
    id: partial.id || "vip",
    booking_id: "b1",
    kind: partial.kind || "accueil_vip",
    title: partial.title || "Accueil VIP",
    supplier: partial.supplier ?? "Coral Thailand",
    confirmation_ref: partial.confirmation_ref ?? "PNR-021811",
    start_at: partial.start_at ?? null,
    end_at: partial.end_at ?? null,
    amount: partial.amount ?? null,
    include_in_ledger: false,
    sort_order: partial.sort_order ?? 0,
    details: partial.details || {},
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
  };
}

function asStay(flightRow: AccueilVipFlight, sort: number): CrmBookingItem {
  return cardItem({
    id: flightRow.id,
    kind: "flight",
    title: flightRow.title || "",
    supplier: null,
    confirmation_ref: null,
    start_at: flightRow.start_at,
    end_at: flightRow.end_at,
    sort_order: sort,
    details: flightRow.details || {},
  });
}

test("préposition de départ", () => {
  assert.equal(placeFromPreposition("Phuket"), "de Phuket");
  assert.equal(placeFromPreposition("Le Havre"), "du Havre");
  assert.equal(placeFromPreposition("Les Seychelles"), "des Seychelles");
  assert.equal(placeFromPreposition("Ajaccio"), "d'Ajaccio");
});

test("titres sans la ville de l’autre vol", () => {
  const phuket = composeAccueilVip(fields(), [ARRIVAL, DEPARTURE]);
  assert.equal(phuket.ok, true);
  if (!phuket.ok) return;
  assert.equal(phuket.card.title, "Accueil VIP à Phuket");
  assert.equal(/Paris|CDG/.test(phuket.card.title), false);
  assert.equal(phuket.card.details.city, undefined);
  const arrival = composeAccueilVip(fields({ service: "arrival", departureFlightId: "" }), [ARRIVAL]);
  assert.equal(arrival.ok && arrival.card.title, "Accueil VIP à l'arrivée à Phuket");
  const named = (city: string, iata: string): AccueilVipFlight =>
    flight({
      id: iata,
      title: `Paris → ${city}`,
      start_at: "2026-12-26T10:00:00",
      end_at: "2026-12-26T12:00:00",
      details: { to: iata, city_to: city, from: "CDG", city_from: "Paris", flight_number: "AF1" },
    });
  const havre = named("Le Havre", "LEH");
  const aja = named("Ajaccio", "AJA");
  assert.equal(
    composeAccueilVip(fields({ service: "arrival", arrivalFlightId: havre.id, departureFlightId: "" }), [havre]).ok &&
      accueilVipTitle("arrival", readAccueilVipLegs(
        (composeAccueilVip(fields({ service: "arrival", arrivalFlightId: havre.id, departureFlightId: "" }), [havre]) as { card: { details: Record<string, unknown> } }).card.details
      )),
    "Accueil VIP à l'arrivée au Havre"
  );
  const left = composeAccueilVip(fields({ service: "departure", arrivalFlightId: "", departureFlightId: aja.id }), [
    flight({
      id: aja.id,
      title: "Ajaccio → Paris",
      start_at: "2026-12-26T11:00:00",
      end_at: "2026-12-26T13:00:00",
      details: { from: "AJA", to: "CDG", city_from: "Ajaccio", city_to: "Paris", flight_number: "AF2" },
    }),
  ]);
  assert.equal(left.ok && left.card.title, "Accueil VIP au départ d'Ajaccio");
});

test("un accueil sans vol est refusé, un aller-retour exige deux vols", () => {
  const missing = composeAccueilVip(fields({ service: "arrival", arrivalFlightId: "" }), [ARRIVAL]);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error, /vol/);
  const same = composeAccueilVip(fields({ arrivalFlightId: ARRIVAL.id, departureFlightId: ARRIVAL.id }), [ARRIVAL]);
  assert.equal(same.ok, false);
  const unknown = composeAccueilVip(fields({ arrivalFlightId: "absent" }), [ARRIVAL, DEPARTURE]);
  assert.equal(unknown.ok, false);
  const round = composeAccueilVip(fields(), [ARRIVAL, DEPARTURE]);
  assert.equal(round.ok, true);
  if (!round.ok) return;
  const legs = readAccueilVipLegs(round.card.details);
  assert.deepEqual(
    legs.map((leg) => [leg.role, leg.flight_number, leg.airport_iata, leg.at]),
    [
      ["arrival", "AF956", "HKT", "2026-12-26T05:50:00"],
      ["departure", "AF157", "HKT", "2027-01-08T11:55:00"],
    ]
  );
  assert.equal(/Paris|CDG/.test(JSON.stringify(legs.map((leg) => leg.airport_city))), false);
});

test("un vol modifié remet l’heure et l’aéroport", () => {
  const made = composeAccueilVip(fields(), [ARRIVAL, DEPARTURE]);
  assert.equal(made.ok, true);
  if (!made.ok) return;
  const vip = cardItem({
    title: made.card.title,
    start_at: made.card.start_at,
    end_at: made.card.end_at,
    details: made.card.details,
  });
  const later: AccueilVipFlight = {
    ...ARRIVAL,
    end_at: "2026-12-26T06:10:00",
    details: { ...ARRIVAL.details, city_to: "Phuket", to: "HKT" },
  };
  const live = withLiveAccueilVip([asStay(later, 0), asStay(DEPARTURE, 1), vip]);
  const next = live.find((item) => item.kind === "accueil_vip");
  const legs = readAccueilVipLegs(next?.details);
  assert.equal(legs.find((leg) => leg.role === "arrival")?.at, "2026-12-26T06:10:00");
  assert.equal(next?.title.includes("Paris"), false);
});

test("timeline : arrivée de nuit le jour d’arrivée, départ juste avant le vol", () => {
  const made = composeAccueilVip(fields(), [ARRIVAL, DEPARTURE]);
  assert.equal(made.ok, true);
  if (!made.ok) return;
  const vip = cardItem({
    id: "vip",
    title: made.card.title,
    start_at: made.card.start_at,
    end_at: made.card.end_at,
    sort_order: 50,
    details: made.card.details,
  });
  const days = groupByDay([asStay(ARRIVAL, 0), asStay(DEPARTURE, 1), vip]);
  const byDay = Object.fromEntries(days.map(([day, rows]) => [day, rows.map((row) => row.kind === "flight" ? row.id : "vip")]));
  assert.deepEqual(byDay["2026-12-25"], ["af956"]);
  assert.deepEqual(byDay["2026-12-26"], ["vip"]);
  assert.deepEqual(byDay["2027-01-08"], ["vip", "af157"]);

  const sameDayArrival = flight({
    id: "day",
    title: "Bangkok → Phuket",
    start_at: "2026-12-26T08:00:00",
    end_at: "2026-12-26T09:20:00",
    details: { flight_number: "TG1", from: "BKK", to: "HKT", city_from: "Bangkok", city_to: "Phuket" },
  });
  const arrivalOnly = composeAccueilVip(fields({ service: "arrival", arrivalFlightId: "day", departureFlightId: "" }), [sameDayArrival]);
  assert.equal(arrivalOnly.ok, true);
  if (!arrivalOnly.ok) return;
  const beside = placeAccueilVipBesideFlights(
    [
      asStay(sameDayArrival, 0),
      cardItem({ id: "meet", details: arrivalOnly.card.details, start_at: arrivalOnly.card.start_at }),
    ],
    "2026-12-26"
  );
  assert.deepEqual(beside.map((row) => row.id), ["day", "meet"]);
});

test("le texte client garde les puces, le prix facultatif entre dans le séjour", () => {
  const blocks = clientInfoBlocks(INFO);
  assert.equal(blocks[0]?.type, "paragraph");
  assert.equal(blocks[1]?.type, "list");
  if (blocks[1]?.type === "list") assert.equal(blocks[1].items.length, 3);
  const priced = composeAccueilVip(fields({ amount: 180 }), [ARRIVAL, DEPARTURE]);
  assert.equal(priced.ok && priced.card.amount, 180);
  const free = composeAccueilVip(fields({ amount: null }), [ARRIVAL, DEPARTURE]);
  assert.equal(free.ok && free.card.amount, null);
  assert.equal(
    bookingTotalFromItems([
      { kind: "accueil_vip", amount: 180 },
      { kind: "accueil_vip", amount: null },
      { kind: "greeter", amount: 90 },
    ]),
    180
  );
});

test("la copie relie les vols de la copie, et l’agenda ne couvre pas les deux jours d’un coup", () => {
  const made = composeAccueilVip(fields(), [ARRIVAL, DEPARTURE]);
  assert.equal(made.ok, true);
  if (!made.ok) return;
  const ids = new Map([
    ["af956", "copy-956"],
    ["af157", "copy-157"],
  ]);
  const remapped = remapAccueilVipLinks(made.card.details, ids);
  assert.deepEqual(readAccueilVipLegs(remapped).map((leg) => leg.flight_id), ["copy-956", "copy-157"]);
  const cities = tripCityPlan([
    { kind: "flight", title: "Paris → Phuket", start_at: ARRIVAL.start_at, end_at: ARRIVAL.end_at, details: ARRIVAL.details },
    { kind: "flight", title: "Phuket → Paris", start_at: DEPARTURE.start_at, end_at: DEPARTURE.end_at, details: DEPARTURE.details },
    { kind: "accueil_vip", title: made.card.title, start_at: made.card.start_at, end_at: made.card.end_at, details: made.card.details },
  ]);
  const without = tripCityPlan([
    { kind: "flight", title: "Paris → Phuket", start_at: ARRIVAL.start_at, end_at: ARRIVAL.end_at, details: ARRIVAL.details },
    { kind: "flight", title: "Phuket → Paris", start_at: DEPARTURE.start_at, end_at: DEPARTURE.end_at, details: DEPARTURE.details },
  ]);
  assert.deepEqual(cities.destinations, without.destinations);

  const vip = cardItem({
    id: "vip-1",
    title: made.card.title,
    start_at: made.card.start_at,
    end_at: made.card.end_at,
    details: made.card.details,
  });
  const booking = {
    id: "b1",
    reference: "TB-2026-0088",
    title: "Phuket & Krabi",
    destination: "Phuket",
    status: "confirmed",
    start_date: "2026-12-25",
    end_date: "2027-01-08",
    currency: "EUR",
  } as CrmBooking;
  const ics = buildBookingIcs({ booking, items: [vip], itemId: vip.id });
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /UID:vip-1-arrival@travelba\.fr/);
  assert.match(unfolded, /UID:vip-1-departure@travelba\.fr/);
  assert.match(unfolded, /DTSTART;TZID=Asia\/Bangkok:20261226T055000/);
  assert.match(unfolded, /DTEND;TZID=Asia\/Bangkok:20261226T065000/);
  assert.match(unfolded, /DTSTART;TZID=Asia\/Bangkok:20270108T115500/);
  assert.match(unfolded, /LOCATION:Phuket \(HKT\)/);
  assert.match(unfolded, /Ce qui est inclus/);
  const events = unfolded.split("BEGIN:VEVENT").slice(1);
  assert.equal(events.length, 2);
  for (const event of events) {
    const start = event.match(/DTSTART;TZID=Asia\/Bangkok:(\d{8})T/);
    const end = event.match(/DTEND;TZID=Asia\/Bangkok:(\d{8})T/);
    assert.equal(start?.[1], end?.[1]);
  }
  const href = googleCalendarHref(vip, booking) || "";
  assert.match(href, /dates=20261225T225000Z%2F20261225T235000Z/);
  assert.equal(href.includes("20270108"), false);
  assert.equal((vip.details as { legs: AccueilVipLeg[] }).legs.length, 2);
});
