import assert from "node:assert/strict";
import test from "node:test";
import { stayArrivalPlaces, stayHeadline } from "./carnet";
import { layoverDossierDiff, nextStayLabels, staffStayFacts, stayTitleFromItems } from "./staff-stay";
import { DEFAULT_LAYOVER_MAX_HOURS, tripCityPlan, type TripStep } from "./layover";

function flight(
  from: string,
  to: string,
  start: string,
  end: string,
  iataFrom = "",
  iataTo = ""
): TripStep {
  return {
    kind: "flight",
    title: `${from} → ${to}`,
    start_at: start,
    end_at: end,
    details: {
      city_from: from,
      city_to: to,
      ...(iataFrom ? { from: iataFrom } : {}),
      ...(iataTo ? { to: iataTo } : {}),
    },
  };
}

function hotel(city: string, start: string, end: string, name = city): TripStep {
  return {
    kind: "hotel",
    title: name,
    start_at: start,
    end_at: end,
    details: { city, hotel_name: name },
  };
}

const PARIS_TLV = [
  flight("Paris", "Amsterdam", "2026-10-24T14:30:00", "2026-10-24T15:45:00", "CDG", "AMS"),
  flight("Amsterdam", "Tel Aviv", "2026-10-24T16:35:00", "2026-10-24T23:50:00", "AMS", "TLV"),
    hotel("Tel Aviv", "2026-10-24", "2026-10-31", "Hôtel"),
  flight("Tel Aviv", "Paris", "2026-10-31T15:55:00", "2026-10-31T19:45:00", "TLV", "CDG"),
];

test("Paris – Amsterdam – Tel Aviv : Amsterdam est une escale, pas la destination", () => {
  assert.equal(DEFAULT_LAYOVER_MAX_HOURS, 24);
  const plan = tripCityPlan(PARIS_TLV);
  assert.deepEqual(plan.layovers, ["Amsterdam"]);
  assert.deepEqual(plan.cities, ["Paris", "Tel Aviv"]);
  assert.deepEqual(plan.destinations, ["Tel Aviv"]);
  assert.equal(
    stayTitleFromItems("Paris · Amsterdam · Tel Aviv", "Tel Aviv", PARIS_TLV),
    "Tel Aviv"
  );
  assert.equal(stayHeadline("40 ans", "Tel Aviv", plan.cities, "Séjour", plan.layovers), "40 ans");
  const facts = staffStayFacts({ destination: "Tel Aviv", items: PARIS_TLV });
  assert.deepEqual(facts.cities, ["Paris", "Tel Aviv"]);
  assert.equal(facts.placeLine, "Paris · Tel Aviv");
  assert.equal(facts.segments.some((segment) => segment.place === "Paris → Amsterdam"), true);
  const diff = layoverDossierDiff("Paris · Amsterdam · Tel Aviv", "Tel Aviv", PARIS_TLV);
  assert.equal(diff?.title?.to, "Tel Aviv");
  assert.equal(diff?.destination, null);
  assert.equal(layoverDossierDiff("Paris · Tel Aviv", "Tel Aviv", PARIS_TLV), null);
});

test("une correspondance le jour même, aller simple, laisse la dernière ville", () => {
  const items = [
    flight("Paris", "Amsterdam", "2026-11-02T09:10:00", "2026-11-02T10:30:00", "CDG", "AMS"),
    flight("Amsterdam", "Lisbonne", "2026-11-02T12:00:00", "2026-11-02T14:20:00", "AMS", "LIS"),
  ];
  const plan = tripCityPlan(items);
  assert.deepEqual(plan.layovers, ["Amsterdam"]);
  assert.deepEqual(plan.cities, ["Paris", "Lisbonne"]);
  assert.deepEqual(plan.destinations, ["Lisbonne"]);
  assert.deepEqual(stayArrivalPlaces(null, null, items), ["Lisbonne"]);
});

test("une correspondance de nuit sans hôtel reste une escale", () => {
  const items = [
    flight("Paris", "Amsterdam", "2026-11-04T22:10:00", "2026-11-04T23:25:00"),
    flight("Amsterdam", "Tel Aviv", "2026-11-05T07:40:00", "2026-11-05T13:10:00"),
    hotel("Tel Aviv", "2026-11-05", "2026-11-12"),
    flight("Tel Aviv", "Paris", "2026-11-12T18:00:00", "2026-11-12T22:00:00"),
  ];
  const plan = tripCityPlan(items);
  assert.deepEqual(plan.layovers, ["Amsterdam"]);
  assert.deepEqual(plan.destinations, ["Tel Aviv"]);
  assert.equal(stayTitleFromItems("Paris · Amsterdam · Tel Aviv", "Amsterdam · Tel Aviv", items), "Tel Aviv");
  const labels = nextStayLabels("Paris · Amsterdam · Tel Aviv", "Amsterdam · Tel Aviv", items);
  assert.equal(labels.destinationChanged, true);
  assert.equal(labels.destination, "Tel Aviv");
});

test("une correspondance avec hôtel est un séjour", () => {
  const items = [
    flight("Tel Aviv", "Frankfurt", "2026-10-28T16:35:00", "2026-10-28T20:15:00", "TLV", "FRA"),
    hotel("Frankfurt", "2026-10-28", "2026-10-29", "Hôtel"),
    flight("Frankfurt", "Tel Aviv", "2026-10-29T08:00:00", "2026-10-29T12:30:00", "FRA", "TLV"),
  ];
  const plan = tripCityPlan(items);
  assert.deepEqual(plan.layovers, []);
  assert.equal(plan.cities.includes("Frankfurt"), true);
  assert.deepEqual(plan.destinations, ["Frankfurt"]);
  assert.equal(layoverDossierDiff("Tel Aviv · Frankfurt · Tel Aviv", "Frankfurt", items), null);
});

test("un arrêt de 24 h ou plus sans hôtel n’est pas une escale", () => {
  const items = [
    flight("Paris", "Frankfurt", "2026-10-28T10:00:00", "2026-10-28T11:30:00"),
    flight("Frankfurt", "Tel Aviv", "2026-10-29T11:30:00", "2026-10-29T16:00:00"),
  ];
  assert.deepEqual(tripCityPlan(items).layovers, []);
  assert.equal(tripCityPlan(items, 30).layovers.includes("Frankfurt"), true);
});

test("un voyage à plusieurs villes garde chaque séjour", () => {
  const items = [
    flight("Paris", "Milan", "2026-12-04T09:00:00", "2026-12-04T10:40:00", "CDG", "MXP"),
    hotel("Milan", "2026-12-04", "2026-12-08", "Four Seasons"),
    flight("Milan", "Rome", "2026-12-08T12:00:00", "2026-12-08T13:20:00", "MXP", "FCO"),
    hotel("Rome", "2026-12-08", "2026-12-13", "Casa Monti"),
    flight("Rome", "Paris", "2026-12-13T16:00:00", "2026-12-13T18:10:00", "FCO", "CDG"),
  ];
  const plan = tripCityPlan(items);
  assert.deepEqual(plan.layovers, []);
  assert.deepEqual(plan.cities, ["Paris", "Milan", "Rome"]);
  assert.deepEqual(plan.destinations, ["Milan", "Rome"]);
  assert.equal(stayTitleFromItems("Paris · Milan", "Paris · Milan", items), "Milan · Rome");
});

test("un nom choisi qui cite l’escale n’est pas réécrit", () => {
  const diff = layoverDossierDiff("Week-end · Amsterdam", "Tel Aviv", PARIS_TLV);
  assert.equal(diff?.customTitle, true);
  assert.equal(diff?.title, null);
  assert.equal(diff?.destination, null);
});

test("un transfert sur place empêche de traiter la ville comme une escale", () => {
  const items = [
    flight("Paris", "Amsterdam", "2026-11-02T09:10:00", "2026-11-02T10:30:00"),
    {
      kind: "transfer",
      title: "Schiphol → centre",
      start_at: "2026-11-02T11:00:00",
      end_at: "2026-11-02T11:40:00",
      details: { pickup: "Amsterdam", dropoff: "Amsterdam" },
    },
    flight("Amsterdam", "Lisbonne", "2026-11-02T18:00:00", "2026-11-02T20:20:00"),
  ];
  assert.deepEqual(tripCityPlan(items).layovers, []);
  assert.equal(tripCityPlan(items).cities.includes("Amsterdam"), true);
});

test("Singapour et Singapore sont la même ville, Zurich et Munich des escales", () => {
  const items = [
    flight("Tel Aviv", "Zurich", "2026-11-15T18:00:00", "2026-11-15T21:25:00", "TLV", "ZRH"),
    flight("Zurich", "Singapour", "2026-11-15T22:35:00", "2026-11-16T18:05:00", "ZRH", "SIN"),
    hotel("Singapour", "2026-11-16", "2026-11-19", "Hôtel"),
    hotel("Singapore", "2026-11-19", "2026-11-22", "Autre hôtel"),
    flight("Singapour", "Munich", "2026-11-22T23:45:00", "2026-11-23T05:40:00", "SIN", "MUC"),
    flight("Munich", "Tel Aviv", "2026-11-23T11:20:00", "2026-11-23T16:05:00", "MUC", "TLV"),
  ];
  const plan = tripCityPlan(items);
  assert.deepEqual(plan.layovers, ["Zurich", "Munich"]);
  assert.deepEqual(plan.cities, ["Tel Aviv", "Singapour"]);
  assert.deepEqual(plan.destinations, ["Singapour"]);
  const diff = layoverDossierDiff("Tel Aviv · Zurich · Singapour · Singapore · Munich", "Singapore · Singapore", items);
  assert.equal(diff?.title?.to, "Singapour");
  assert.equal(diff?.destination, null);
});

test("l’aller-retour depuis Lyon garde Rome, pas Lyon, comme destination", () => {
  const items = [
    flight("Lyon", "Rome", "2026-06-01T08:00:00", "2026-06-01T09:50:00"),
    hotel("Rome", "2026-06-01", "2026-06-05"),
    flight("Rome", "Lyon", "2026-06-05T18:00:00", "2026-06-05T19:50:00"),
  ];
  const plan = tripCityPlan(items);
  assert.deepEqual(plan.cities, ["Lyon", "Rome"]);
  assert.deepEqual(plan.destinations, ["Rome"]);
});
