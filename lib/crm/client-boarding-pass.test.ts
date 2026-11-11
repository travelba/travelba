import assert from "node:assert/strict";
import test from "node:test";
import {
  boardingOfferForDocument,
  clientBoardingCards,
  clientBoardingFullHref,
  clientBoardingHref,
  clientBoardingView,
  scopeBoardingOffer,
} from "./client-boarding-pass";
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

test("un PDF Air France donne une page par passager et garde le fichier entier", () => {
  const offer = boardingOfferForDocument({
    doc: { id: DOC, kind: "carte d'embarquement", file_name: "carte-embarquement-AF7308.pdf" },
    passengers: [
      passenger({ firstName: "Camille", page: 1, seat: "21B", flight: "AF 7308" }),
      passenger({ firstName: "Inès", page: 2, seat: "21C", flight: "AF 7308" }),
    ],
    flights: [flight, { ...flight, id: "flight-2", details: { ...flight.details, flight_number: "AF 7309" } }],
    pageCount: 2,
  });
  assert.equal(offer.cards.length, 2);
  assert.equal(offer.cards[0]?.itemId, "flight-1");
  assert.equal(offer.full.length, 1);
  assert.equal(offer.full[0]?.href, clientBoardingFullHref(DOC));
  assert.match(offer.full[0]?.label || "", /PDF complet/);
  const scoped = scopeBoardingOffer(offer, ["flight-2"]);
  assert.deepEqual(scoped.cards, []);
  assert.deepEqual(scoped.full, []);
  const view = clientBoardingView(scopeBoardingOffer(offer, ["flight-1"]));
  assert.equal(view.cards.length, 2);
  assert.equal(view.cards[0]?.href, `/api/mon-compte/cartes/${DOC}?page=1`);
  assert.equal(view.full[0]?.href.includes("complet=1"), true);
});

test("un PDF illisible de plusieurs pages ne s’ouvre qu’en entier, pas une autre pièce", () => {
  const hidden = boardingOfferForDocument({
    doc: { id: DOC, kind: "carte d'embarquement", file_name: "carte-embarquement-AF7308.pdf" },
    passengers: [],
    flights: [flight],
    pageCount: 4,
  });
  assert.deepEqual(hidden.cards, []);
  assert.equal(hidden.full[0]?.label, "Carte d’embarquement");
  assert.deepEqual(hidden.full[0]?.itemIds, ["flight-1"]);
  const invoice = boardingOfferForDocument({
    doc: { id: DOC, kind: "invoice", file_name: "facture-fournisseur.pdf" },
    passengers: [passenger({ firstName: "Camille", page: 1 })],
    flights: [flight],
    pageCount: 2,
  });
  assert.deepEqual(invoice.cards, []);
  assert.deepEqual(invoice.full, []);
});

test("une autre pièce cachée ne devient pas une carte d’embarquement", () => {
  const cards = clientBoardingCards({
    doc: { id: DOC, kind: "confirmation", file_name: "hotel.pdf" },
    passengers: [passenger({ firstName: "Camille", page: 1 })],
    flights: [flight],
  });
  assert.deepEqual(cards, []);
});
