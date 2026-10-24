import assert from "node:assert/strict";
import test from "node:test";
import { importTitleGuard, MAX_IMPORT_CITIES } from "./import-title";

test("le titre d’import ne garde que les villes de séjour, trois au plus", () => {
  assert.equal(MAX_IMPORT_CITIES, 3);
  const guarded = importTitleGuard({
    title: "Paris · Tel Aviv · Rome · Milan · Lisbonne",
    destination: "Paris · Tel Aviv · Rome · Milan · Lisbonne",
    items: [
      {
        kind: "flight",
        title: "Paris → Tel Aviv",
        start_at: "2026-09-01T09:00:00",
        end_at: "2026-09-01T14:00:00",
        details: { from: "CDG", to: "TLV", city_from: "Paris", city_to: "Tel Aviv" },
      },
      {
        kind: "hotel",
        title: "Four Seasons",
        start_at: "2026-09-01",
        end_at: "2026-09-04",
        details: { hotel_name: "Four Seasons", city: "Tel Aviv" },
      },
      {
        kind: "flight",
        title: "Tel Aviv → Rome",
        start_at: "2026-09-04T10:00:00",
        end_at: "2026-09-04T13:00:00",
        details: { from: "TLV", to: "FCO", city_from: "Tel Aviv", city_to: "Rome" },
      },
      {
        kind: "hotel",
        title: "Hotel de Russie",
        start_at: "2026-09-04",
        end_at: "2026-09-06",
        details: { city: "Rome" },
      },
      {
        kind: "flight",
        title: "Rome → Milan",
        start_at: "2026-09-06T08:00:00",
        end_at: "2026-09-06T09:20:00",
        details: { from: "FCO", to: "MXP", city_from: "Rome", city_to: "Milan" },
      },
      {
        kind: "hotel",
        title: "Milano",
        start_at: "2026-09-06",
        end_at: "2026-09-08",
        details: { city: "Milan" },
      },
      {
        kind: "flight",
        title: "Milan → Lisbonne",
        start_at: "2026-09-08T11:00:00",
        end_at: "2026-09-08T13:00:00",
        details: { from: "MXP", to: "LIS", city_from: "Milan", city_to: "Lisbonne" },
      },
      {
        kind: "hotel",
        title: "Memmo",
        start_at: "2026-09-08",
        end_at: "2026-09-10",
        details: { city: "Lisbonne" },
      },
      {
        kind: "flight",
        title: "Lisbonne → Paris",
        start_at: "2026-09-10T16:00:00",
        end_at: "2026-09-10T19:00:00",
        details: { from: "LIS", to: "CDG", city_from: "Lisbonne", city_to: "Paris" },
      },
    ],
  });
  assert.equal(guarded.title.split(" · ").length <= 3, true);
  assert.equal(guarded.title.includes("Paris"), false);
  assert.equal(guarded.title.includes("Four Seasons"), false);
  assert.equal(guarded.review, true);
});

test("un nom choisi reste, un nom d’hôtel devient la ville", () => {
  const named = importTitleGuard({
    title: "40 ans",
    items: [
      {
        kind: "hotel",
        title: "La Mamounia",
        start_at: "2026-10-01",
        end_at: "2026-10-05",
        details: { hotel_name: "La Mamounia", city: "Marrakech" },
      },
    ],
  });
  assert.equal(named.title, "40 ans");
  const hotel = importTitleGuard({
    title: "Four Seasons Milano",
    items: [
      {
        kind: "hotel",
        title: "Four Seasons Milano",
        start_at: "2026-10-01",
        end_at: "2026-10-04",
        details: { hotel_name: "Four Seasons Milano", city: "Milan" },
      },
    ],
  });
  assert.equal(hotel.title, "Milan");
  assert.equal(hotel.review, true);
});
