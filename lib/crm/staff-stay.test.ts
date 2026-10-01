import assert from "node:assert/strict";
import test from "node:test";
import {
  staffBlockingChips,
  staffLedgerCaption,
  staffStayFacts,
  staffStayLabel,
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
