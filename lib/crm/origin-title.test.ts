import assert from "node:assert/strict";
import test from "node:test";
import { listStayDestination, listStayTitle, stayHeadline } from "./carnet";
import { bookingCoverPlan } from "./covers";
import { nextStayLabels, stayTitleFromItems, withoutHomeCity } from "./staff-stay";
import { tripCityPlan, type TripStep } from "./layover";

function flight(from: string, to: string, start: string, end: string, iataFrom = "", iataTo = ""): TripStep {
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

function hotel(city: string, start: string, end: string): TripStep {
  return {
    kind: "hotel",
    title: city,
    start_at: start,
    end_at: end,
    details: { city, hotel_name: city },
  };
}

const SEYCHELLES = [
  flight("Paris", "Tel Aviv", "2027-08-04T10:00:00", "2027-08-04T16:00:00", "CDG", "TLV"),
  flight("Tel Aviv", "Seychelles", "2027-08-11T09:00:00", "2027-08-11T18:00:00", "TLV", "SEZ"),
  flight("Seychelles", "Paris", "2027-08-25T20:00:00", "2027-08-26T06:00:00", "SEZ", "CDG"),
];

test("CDG → Tel Aviv → Seychelles → CDG : ni Paris ni la tour Eiffel", () => {
  const plan = tripCityPlan(SEYCHELLES);
  assert.deepEqual(plan.destinations, ["Tel Aviv", "Seychelles"]);
  assert.deepEqual(plan.origins, ["Paris"]);
  const labels = nextStayLabels("Paris · Tel Aviv · Seychelles", "Paris · Tel Aviv · Seychelles", SEYCHELLES);
  assert.equal(labels.title, "Tel Aviv · Seychelles");
  assert.equal(labels.destination, "Tel Aviv · Seychelles");
  assert.equal(
    stayTitleFromItems("CDG · Tel Aviv · Seychelles", "CDG · Tel Aviv · Seychelles", SEYCHELLES),
    "Tel Aviv · Seychelles"
  );
  assert.equal(
    stayHeadline(
      "Paris · Tel Aviv · Seychelles",
      "Paris · Tel Aviv · Seychelles",
      plan.cities,
      "Séjour",
      [...plan.layovers, ...plan.origins]
    ),
    "Tel Aviv · Seychelles"
  );
  assert.equal(
    stayHeadline("Tel Aviv · Seychelles", "Tel Aviv · Seychelles", plan.cities, "Séjour", plan.origins),
    "Tel Aviv · Seychelles"
  );
  const cover = bookingCoverPlan(
    { destination: "Paris · Tel Aviv · Seychelles", title: "Paris · Tel Aviv · Seychelles", cover_image_path: null },
    { items: SEYCHELLES }
  );
  assert.equal(cover.mode, "split");
  if (cover.mode !== "split") return;
  assert.match(cover.src, /photo-1528791075103-b149f525eb22/);
  assert.match(cover.srcB, /photo-city-seychelles/);
  assert.doesNotMatch(`${cover.src} ${cover.srcB}`, /photo-1502602898657/);
});

test("aller-retour Paris → Marrakech → Paris : Marrakech", () => {
  const items = [
    flight("Paris", "Marrakech", "2026-11-02T08:00:00", "2026-11-02T11:00:00", "CDG", "RAK"),
    hotel("Marrakech", "2026-11-02", "2026-11-09"),
    flight("Marrakech", "Paris", "2026-11-09T18:00:00", "2026-11-09T21:30:00", "RAK", "CDG"),
  ];
  assert.equal(stayTitleFromItems("Paris · Marrakech", "Paris · Marrakech", items), "Marrakech");
  const labels = nextStayLabels("Paris · Marrakech", "Paris · Marrakech", items);
  assert.equal(labels.destination, "Marrakech");
});

test("aller simple : la ville d’arrivée reste, même Paris", () => {
  const away = [
    flight("Paris", "Marrakech", "2026-11-02T08:00:00", "2026-11-02T11:00:00"),
    hotel("Marrakech", "2026-11-02", "2026-11-06"),
  ];
  assert.equal(stayTitleFromItems("Paris · Marrakech", "Paris", away), "Marrakech");

  const home = [
    flight("Lyon", "Paris", "2026-12-01T07:00:00", "2026-12-01T08:10:00"),
    hotel("Paris", "2026-12-01", "2026-12-04"),
  ];
  assert.deepEqual(tripCityPlan(home).destinations, ["Paris"]);
  assert.equal(stayTitleFromItems("Lyon · Paris", "Lyon · Paris", home), "Paris");
  assert.equal(nextStayLabels("Lyon · Paris", "Lyon · Paris", home).destination, "Paris");
});

test("open-jaw : on quitte Paris, on séjourne à Rome et Milan, on atterrit à Lyon", () => {
  const items = [
    flight("Paris", "Rome", "2026-09-04T09:00:00", "2026-09-04T11:10:00", "CDG", "FCO"),
    hotel("Rome", "2026-09-04", "2026-09-08"),
    flight("Rome", "Milan", "2026-09-08T12:00:00", "2026-09-08T13:10:00", "FCO", "MXP"),
    hotel("Milan", "2026-09-08", "2026-09-12"),
    flight("Milan", "Lyon", "2026-09-12T16:00:00", "2026-09-12T17:20:00", "MXP", "LYS"),
  ];
  const labels = nextStayLabels("Paris · Rome · Milan · Lyon", "Paris · Rome · Milan · Lyon", items);
  assert.equal(labels.title, "Rome · Milan");
  assert.equal(labels.destination, "Rome · Milan");
  assert.equal(tripCityPlan(items).origins.join(" · "), "Paris");
});

test("la ville de la fiche sort du titre si le séjour est ailleurs", () => {
  const items = [hotel("Marrakech", "2026-11-02", "2026-11-09")];
  assert.equal(stayTitleFromItems("Lyon · Marrakech", "Lyon · Marrakech", items, "Séjour", "Lyon"), "Marrakech");
  assert.equal(stayTitleFromItems("40 ans", "Lyon · Marrakech", items, "Séjour", "Lyon"), "40 ans");
  assert.equal(withoutHomeCity("Paris · Tel Aviv", "Paris"), "Tel Aviv");
  assert.equal(withoutHomeCity("Paris", "Paris"), "Paris");
});

test("une liste affiche le séjour, pas le départ ni la ville de la fiche", () => {
  assert.equal(
    listStayTitle(
      "Paris · Tel Aviv · Seychelles",
      "Paris · Tel Aviv · Seychelles",
      ["Tel Aviv", "Seychelles"],
      ["Paris", "Tel Aviv", "Seychelles"]
    ),
    "Tel Aviv · Seychelles"
  );
  assert.equal(
    listStayDestination(
      "Paris · Tel Aviv · Seychelles",
      ["Tel Aviv", "Seychelles"],
      ["Paris", "Tel Aviv", "Seychelles"]
    ),
    "Tel Aviv · Seychelles"
  );
  assert.equal(
    listStayTitle("Lyon · Marrakech", "Lyon · Marrakech", ["Marrakech"], ["Marrakech"], [], "Séjour", "Lyon"),
    "Marrakech"
  );
  assert.equal(
    listStayTitle("40 ans", "Lyon · Marrakech", ["Marrakech"], ["Marrakech"], [], "Séjour", "Lyon"),
    "40 ans"
  );
  assert.equal(
    listStayDestination("Lyon · Marrakech", ["Marrakech"], ["Marrakech"], [], "Lyon"),
    "Marrakech"
  );
});
