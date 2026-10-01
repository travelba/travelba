import assert from "node:assert/strict";
import test from "node:test";
import {
  staffBlockingChips,
  staffLedgerCaption,
  staffStayFacts,
  staffStayLabel,
  stayTitleFromItems,
} from "./staff-stay";

test("l’état visible est préparation, montré ou archivé", () => {
  assert.equal(staffStayLabel({ visible_to_client: false, archived_at: null }), "En préparation");
  assert.equal(
    staffStayLabel({ visible_to_client: false, status: "confirmed" } as { visible_to_client: boolean }),
    "En préparation"
  );
  assert.equal(staffStayLabel({ visible_to_client: true }), "Montré au client");
  assert.equal(
    staffStayLabel({ visible_to_client: true, archived_at: "2026-10-01T00:00:00.000Z" }),
    "Archivée"
  );
});

test("les manques comptent passeport, courriers hôtel et montant caché", () => {
  const chips = staffBlockingChips({
    travelers: [
      { id: "a", first_name: "Judith", last_name: "Charbit" },
      { id: "b", first_name: "Arnaud", last_name: "Vinci" },
    ],
    missingPassportIds: ["a"],
    hotelLettersOpen: 2,
    amountHidden: true,
  });
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ["Passeport Judith", "2 courriers hôtel", "Montant non montré"]
  );
});

test("le grand livre attend que le confirmé soit montré, un devis ne débite pas", () => {
  assert.equal(
    staffLedgerCaption({ status: "confirmed", visible_to_client: false, include_in_ledger: true }),
    "Pas encore"
  );
  assert.equal(
    staffLedgerCaption({ status: "confirmed", visible_to_client: true, include_in_ledger: true }),
    "Au grand livre"
  );
  assert.equal(
    staffLedgerCaption({ status: "quoted", visible_to_client: true, include_in_ledger: true }),
    "Pas de débit"
  );
});

test("lieu et dates suivent toutes les étapes, pas un seul champ figé", () => {
  const facts = staffStayFacts({
    destination: "Paris · Milan",
    startDate: "2026-12-04",
    endDate: "2026-12-08",
    items: [
      {
        id: "vol-aller",
        kind: "flight",
        start_at: "2026-12-04T09:00:00",
        details: { city_from: "Paris", city_to: "Milan", from: "CDG", to: "MXP" },
      },
      {
        id: "fs",
        kind: "hotel",
        title: "Four Seasons",
        start_at: "2026-12-04",
        end_at: "2026-12-08",
        details: { hotel_name: "Four Seasons Milan", city: "Milan" },
      },
      {
        id: "casa",
        kind: "hotel",
        title: "Casa Monti",
        start_at: "2026-12-08",
        end_at: "2026-12-13",
        details: { hotel_name: "Casa Monti", city: "Rome" },
      },
      {
        id: "vol-retour",
        kind: "flight",
        start_at: "2026-12-13T16:00:00",
        details: { city_from: "Rome", city_to: "Paris", from: "FCO", to: "CDG" },
      },
    ],
  });
  assert.deepEqual(facts.cities, ["Paris", "Milan", "Rome"]);
  assert.equal(facts.placeLine, "Paris · Milan · Rome");
  assert.equal(facts.fromSteps, true);
  assert.match(facts.dates, /4/);
  assert.match(facts.dates, /13/);
  assert.equal(facts.segments[2]?.place, "Casa Monti");
  assert.match(facts.segments[2]?.when || "", /13/);
  assert.equal(facts.segments[3]?.place, "Rome → Paris");
  assert.equal(facts.nights, 9);
});

test("le titre suit chaque ville ajoutée, sans répéter Milan ni Rome", () => {
  const items = [
    {
      id: "vol-aller",
      kind: "flight",
      start_at: "2026-12-04T15:55:00",
      details: { city_from: "Paris", city_to: "Milan", from: "CDG", to: "MXP" },
    },
    {
      id: "fs",
      kind: "hotel",
      start_at: "2026-12-04",
      end_at: "2026-12-08",
      details: { city: "Milano", hotel_name: "Four Seasons Hotel Milano" },
    },
    {
      id: "train",
      kind: "rail",
      start_at: "2026-12-08T17:35:00",
      details: { city_from: "Milano", city_to: "Roma" },
    },
    {
      id: "casa",
      kind: "hotel",
      start_at: "2026-12-08",
      end_at: "2026-12-13",
      details: { city: "Rome", hotel_name: "Casa Monti" },
    },
    {
      id: "vol-retour",
      kind: "flight",
      start_at: "2026-12-13T16:00:00",
      details: { city_from: "Rome", city_to: "Paris" },
    },
  ];
  assert.equal(stayTitleFromItems("Paris · Milan", "Paris · Milan", items), "Paris · Milan · Rome");
  assert.equal(stayTitleFromItems("40 ans", "Paris · Milan", items), "40 ans");
  const facts = staffStayFacts({
    destination: "Paris · Milan",
    startDate: "2026-12-04",
    endDate: "2026-12-08",
    items,
  });
  assert.deepEqual(facts.cities, ["Paris", "Milan", "Rome"]);
  assert.equal(facts.placeLine, "Paris · Milan · Rome");
});

test("lieu et dates n’imprime qu’une fois le même séjour et le même trajet", () => {
  const facts = staffStayFacts({
    destination: "Paris · Milan",
    startDate: "2026-12-04",
    endDate: "2026-12-08",
    items: [
      {
        id: "fs-milan",
        kind: "hotel",
        title: "Four Seasons Hotel Milan",
        start_at: "2026-12-04T00:00:00+00:00",
        end_at: "2026-12-08T00:00:00+00:00",
        sort_order: 2,
        details: { hotel_name: "Four Seasons Hotel Milan", city: "Milan" },
      },
      {
        id: "fs-milano",
        kind: "hotel",
        title: "Four Seasons Hotel Milano",
        start_at: "2026-12-04T00:00:00+00:00",
        end_at: "2026-12-08T00:00:00+00:00",
        sort_order: 3,
        details: { hotel_name: "Four Seasons Hotel Milano", city: "Milano" },
      },
      {
        id: "paris-milan-late",
        kind: "flight",
        title: "Paris à Milan",
        start_at: "2026-12-04T20:55:00+00:00",
        sort_order: 0,
        details: { city_from: "Paris", city_to: "Milan", from: "CDG", to: "LIN" },
      },
      {
        id: "paris-milan-early",
        kind: "flight",
        title: "Vol de Paris à Milan",
        start_at: "2026-12-04T15:55:00+00:00",
        sort_order: 1,
        details: { city_from: "Paris", city_to: "Milan", from: "CDG", to: "MXP" },
      },
      {
        id: "milan-paris",
        kind: "flight",
        title: "Milan à Paris",
        start_at: "2026-12-08T18:30:00+00:00",
        sort_order: 4,
        details: { city_from: "Milan", city_to: "Paris", from: "MXP", to: "CDG" },
      },
      {
        id: "train",
        kind: "rail",
        title: "Milano · Roma",
        start_at: "2026-12-08T17:35:00+00:00",
        sort_order: 5,
        details: { city_from: "Milano", city_to: "Roma" },
      },
      {
        id: "rome-paris",
        kind: "flight",
        title: "Vol de Rome à Paris",
        start_at: "2026-12-13T16:00:00+00:00",
        sort_order: 6,
        details: { city_from: "Rome", city_to: "Paris", from: "FCO", to: "CDG" },
      },
      {
        id: "rome-spelling",
        kind: "flight",
        title: "Roma à Paris",
        start_at: "2026-12-13T18:00:00+00:00",
        sort_order: 9,
        details: { city_from: "Roma", city_to: "Paris", from: "FCO", to: "CDG" },
      },
      {
        id: "casa",
        kind: "hotel",
        title: "Casa Monti",
        start_at: "2026-12-08T00:00:00+00:00",
        end_at: "2026-12-13T00:00:00+00:00",
        sort_order: 7,
        details: { hotel_name: "Casa Monti", city: "Rome" },
      },
    ],
  });
  assert.deepEqual(
    facts.segments.map((segment) => segment.place),
    [
      "Four Seasons Hotel Milan",
      "Paris → Milan",
      "Casa Monti",
      "Milano → Roma",
      "Milan → Paris",
      "Rome → Paris",
    ]
  );
  assert.deepEqual(
    facts.segments.map((segment) => segment.id),
    ["fs-milan", "paris-milan-early", "casa", "train", "milan-paris", "rome-paris"]
  );
  assert.match(facts.segments[0]?.when || "", /8/);
  assert.match(facts.segments[1]?.when || "", /^4 /);
  assert.match(facts.segments[2]?.when || "", /13/);
  assert.match(facts.segments[3]?.when || "", /^8 /);
  assert.match(facts.segments[4]?.when || "", /^8 /);
  assert.match(facts.segments[5]?.when || "", /^13 /);
  assert.deepEqual(facts.cities, ["Milan", "Paris", "Rome"]);
  assert.equal(facts.placeLine, "Milan · Paris · Rome");
  assert.equal(facts.nights, 9);
});
