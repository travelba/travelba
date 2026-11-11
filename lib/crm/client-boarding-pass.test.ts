import assert from "node:assert/strict";
import test from "node:test";
import { clientBoardingCards, clientBoardingHref } from "./client-boarding-pass";
import type { BoardingPassPassenger } from "./boarding-pass-pdf";

const DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const flight = {
  id: "flight-1",
  kind: "flight",
  title: "Paris → Nice",
  start_at: "2026-11-11T13:50:00",
  visible_to_client: true,
  lifecycle: "active",
  details: {
    flight_number: "AF 7308",
    city_from: "Paris",
    city_to: "Nice",
    from: "CDG",
    to: "NCE",
    terminal: "2E",
    gate: "K42",
  },
};

function passenger(partial: Partial<BoardingPassPassenger> & Pick<BoardingPassPassenger, "firstName" | "page">): BoardingPassPassenger {
  return {
    lastName: "Martin",
    flight: "AF 7308",
    route: "Paris → Nice",
    when: "11 nov. 2026 à 13h50",
    seat: "12A",
    ...partial,
  };
}

test("chaque passager n’ouvre que sa page, rattachée au vol", () => {
  const cards = clientBoardingCards({
    doc: { id: DOC, kind: "carte d'embarquement", file_name: "cartes.pdf" },
    passengers: [
      passenger({ firstName: "Camille", page: 1, seat: "12A" }),
      passenger({ firstName: "Inès", page: 2, seat: "12B" }),
    ],
    flights: [flight, { ...flight, id: "flight-2", details: { ...flight.details, flight_number: "AF 7310" } }],
  });
  assert.equal(cards.length, 2);
  assert.deepEqual(
    cards.map((card) => [card.firstName, card.page, card.itemId, card.terminal, card.gate, card.seat]),
    [
      ["Camille", 1, "flight-1", "2E", "K42", "12A"],
      ["Inès", 2, "flight-1", "2E", "K42", "12B"],
    ]
  );
  assert.equal(clientBoardingHref(DOC, 2), `/api/mon-compte/cartes/${DOC}?page=2`);
  assert.equal(cards.some((card) => card.firstName === "Noah"), false);
});

test("un PDF illisible de plusieurs pages n’est pas proposé en entier", () => {
  const cards = clientBoardingCards({
    doc: { id: DOC, kind: "carte d'embarquement" },
    passengers: [],
    flights: [flight],
    pageCount: 4,
  });
  assert.deepEqual(cards, []);
});

test("une autre pièce cachée ne devient pas une carte d’embarquement", () => {
  const cards = clientBoardingCards({
    doc: { id: DOC, kind: "confirmation", file_name: "hotel.pdf" },
    passengers: [passenger({ firstName: "Camille", page: 1 })],
    flights: [flight],
  });
  assert.deepEqual(cards, []);
});
