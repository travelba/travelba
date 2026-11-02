import assert from "node:assert/strict";
import test from "node:test";
import { flightCardTitle, flightIata } from "./carnet";
import { completeFlightRoutes } from "./flight-route";
import { emptyBookingExtract, type BookingExtract } from "./ingest-types";
import { mergeFileExtracts } from "./ingest-merge";
import { reviewDoubts } from "./review-doubt";
import type { CrmBookingItem } from "./types";

const IATA_REASON = "Les codes IATA de provenance et de destination ne sont pas imprimés";

type Leg = {
  kind: string;
  title: string;
  confirmation_ref?: string;
  start_at?: string;
  end_at?: string;
  supplier?: string;
  details?: Record<string, unknown>;
};

function routes(items: Leg[]) {
  return completeFlightRoutes(items);
}

function asCard(item: { title?: string | null; details?: Record<string, unknown> | null }) {
  return item as CrmBookingItem;
}

test("EK706 puis EK75 : Seychelles, Dubaï, continuité et Paris CDG, sans avertissement", () => {
  const done = routes([
    {
      kind: "flight",
      title: "Seychelles → Dubai",
      confirmation_ref: "X97UJQ",
      start_at: "2026-08-25T08:25:00",
      end_at: "2026-08-25T12:55:00",
      details: {
        flight_number: "EK 706",
        airline: "Emirates",
        city_from: "Seychelles",
        city_to: "Dubai",
        needs_review: true,
        review_reason: IATA_REASON,
      },
    },
    {
      kind: "flight",
      title: "Paris",
      confirmation_ref: "x97 ujq",
      start_at: "2026-08-25T14:40:00",
      end_at: "2026-08-25T20:00:00",
      details: {
        flight_number: "EK75",
        city_to: "Paris",
        needs_review: true,
        review_reason: "codes IATA non imprimés",
      },
    },
    {
      kind: "hotel",
      title: "Four Seasons",
      details: { city: "Mahé" },
    },
  ]);

  assert.equal(done[0].details?.from, "SEZ");
  assert.equal(done[0].details?.to, "DXB");
  assert.equal(done[0].title, "Seychelles → Dubai");
  assert.equal(done[0].details?.needs_review, undefined);
  assert.deepEqual(reviewDoubts(done[0]), []);

  assert.equal(done[1].details?.city_from, "Dubai");
  assert.equal(done[1].details?.city_to, "Paris");
  assert.equal(done[1].details?.from, "DXB");
  assert.equal(done[1].details?.to, "CDG");
  assert.equal(done[1].title, "Dubai → Paris");
  assert.equal(done[1].details?.needs_review, undefined);
  assert.deepEqual(reviewDoubts(done[1]), []);
  assert.equal(flightCardTitle(asCard(done[1])), "Dubai → Paris");
  assert.equal(flightIata(asCard(done[1])), "DXB → CDG");
  assert.equal(done[2].title, "Four Seasons");
});

test("Paris sans compagnie garde l’avertissement, le libellé devient quand même la route", () => {
  const done = routes([
    {
      kind: "flight",
      title: "Seychelles → Dubai",
      confirmation_ref: "X97UJQ",
      start_at: "2026-08-25T08:25:00",
      details: {
        city_from: "Seychelles",
        city_to: "Dubai",
        from: "SEZ",
        to: "DXB",
      },
    },
    {
      kind: "flight",
      title: "Paris",
      confirmation_ref: "X97UJQ",
      start_at: "2026-08-25T14:40:00",
      details: {
        city_to: "Paris",
        needs_review: true,
        review_reason: IATA_REASON,
      },
    },
  ]);
  assert.equal(done[1].title, "Dubai → Paris");
  assert.equal(done[1].details?.from, "DXB");
  assert.equal(done[1].details?.to, undefined);
  assert.equal(done[1].details?.needs_review, true);
  assert.equal(reviewDoubts(done[1])[0], `${IATA_REASON}.`);
});

test("un autre PNR ne fournit pas le départ du segment suivant", () => {
  const done = routes([
    {
      kind: "flight",
      title: "Seychelles → Dubai",
      confirmation_ref: "X97UJQ",
      start_at: "2026-08-25T08:25:00",
      details: { city_from: "Seychelles", city_to: "Dubai", from: "SEZ", to: "DXB" },
    },
    {
      kind: "flight",
      title: "Paris",
      confirmation_ref: "AUTRE",
      start_at: "2026-08-25T14:40:00",
      details: {
        city_to: "Paris",
        needs_review: true,
        review_reason: IATA_REASON,
      },
    },
  ]);
  assert.equal(done[1].title, "Paris");
  assert.equal(done[1].details?.from, undefined);
  assert.equal(done[1].details?.needs_review, true);
});

test("un autre doute reste quand les codes sont déjà là", () => {
  const done = routes([
    {
      kind: "flight",
      title: "Seychelles → Dubai",
      start_at: "2026-08-25T08:25:00",
      details: {
        city_from: "Seychelles",
        city_to: "Dubai",
        needs_review: true,
        review_reason: "Horaire illisible.",
      },
    },
  ]);
  assert.equal(done[0].details?.from, "SEZ");
  assert.equal(done[0].details?.to, "DXB");
  assert.equal(done[0].details?.needs_review, true);
  assert.equal(done[0].details?.review_reason, "Horaire illisible.");
});

test("un vol déjà complet n’est pas recopié", () => {
  const items = [
    {
      kind: "flight",
      title: "Seychelles → Dubai",
      start_at: "2026-08-25T08:25:00",
      confirmation_ref: "X97UJQ",
      details: {
        from: "SEZ",
        to: "DXB",
        city_from: "Seychelles",
        city_to: "Dubai",
        flight_number: "EK 706",
      },
    },
  ];
  assert.equal(completeFlightRoutes(items), items);
  const hotels = [{ kind: "hotel", title: "Hôtel" }];
  assert.equal(completeFlightRoutes(hotels), hotels);
});

test("Qatar vers Londres prend Heathrow, Al Maktoum n’est pas DXB", () => {
  const done = routes([
    {
      kind: "flight",
      title: "Doha → Londres",
      start_at: "2026-09-01T01:00:00",
      details: { flight_number: "QR 15", city_from: "Doha", city_to: "Londres" },
    },
  ]);
  assert.equal(done[0].details?.to, "LHR");
  const worldCentral = routes([
    {
      kind: "flight",
      title: "Paris → Dubai World Central",
      start_at: "2026-09-02T01:00:00",
      details: { flight_number: "EK 80", city_from: "Paris", city_to: "Dubai World Central" },
    },
  ]);
  assert.equal(worldCentral[0].details?.from, "CDG");
  assert.equal(worldCentral[0].details?.to, "DWC");
});

test("la fusion des fichiers complète le même billet", () => {
  const base = emptyBookingExtract();
  const extract: BookingExtract = {
    ...base,
    document_status: "confirmed",
    items: [
      {
        kind: "flight",
        title: "Seychelles → Dubai",
        supplier: "Emirates",
        confirmation_ref: "X97UJQ",
        start_at: "2026-08-25T08:25:00",
        end_at: "2026-08-25T12:55:00",
        amount: null,
        details: {
          flight_number: "EK 706",
          city_from: "Seychelles",
          city_to: "Dubai",
          needs_review: true,
          review_reason: IATA_REASON,
        },
      },
      {
        kind: "flight",
        title: "Paris",
        supplier: "Emirates",
        confirmation_ref: "X97UJQ",
        start_at: "2026-08-25T14:40:00",
        end_at: "2026-08-25T20:00:00",
        amount: null,
        details: {
          flight_number: "EK 75",
          city_to: "Paris",
          needs_review: true,
          review_reason: IATA_REASON,
        },
      },
    ],
  };
  const merged = mergeFileExtracts([
    { name: "billet.pdf", family: "amadeus", extract },
  ]);
  const second = merged.extract.items[1];
  assert.equal(second?.title, "Dubai → Paris");
  assert.equal(second?.details?.from, "DXB");
  assert.equal(second?.details?.to, "CDG");
  assert.equal(second?.details?.needs_review, undefined);
});
