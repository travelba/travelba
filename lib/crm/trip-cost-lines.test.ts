import assert from "node:assert/strict";
import test from "node:test";
import type { PliantCardRecap } from "./pliant-booking";
import type { OutgoingLine, TripCost } from "./trip-costs";
import { costPlacements, pendingCostLines, pliantSpendToOutgoing, revolutLinkedWithoutCost } from "./trip-cost-lines";

const card: PliantCardRecap = {
  pliantCardId: "card-1",
  label: "Mondrian Bordeaux",
  last4: "4321",
  ceilingCents: 300000,
  currency: "EUR",
  spentCents: 0,
  spends: [
    {
      id: "tx-queue",
      merchant: "MONDRIAN BORDEAUX",
      status: "BOOKED",
      type: "PURCHASE",
      billingCents: 128000,
      currency: "EUR",
      bookedAt: "2026-09-02T10:00:00Z",
      matchStatus: "unmatched",
    },
    {
      id: "tx-card-only",
      merchant: "SNCF",
      status: "BOOKED",
      type: "PURCHASE",
      billingCents: 9800,
      currency: "EUR",
      bookedAt: "2026-09-03T08:00:00Z",
      matchStatus: "unmatched",
    },
    {
      id: "tx-refund",
      merchant: "SNCF",
      status: "BOOKED",
      type: "REFUND",
      billingCents: 2000,
      currency: "EUR",
      bookedAt: "2026-09-04",
      matchStatus: "unmatched",
    },
    {
      id: "tx-done",
      merchant: "TAXI",
      status: "BOOKED",
      type: "PURCHASE",
      billingCents: 4000,
      currency: "EUR",
      bookedAt: "2026-09-05",
      matchStatus: "matched",
      matchedBookingId: "booking-1",
    },
    {
      id: "tx-declined",
      merchant: "BAR",
      status: "DECLINED",
      type: "PURCHASE",
      billingCents: 1500,
      currency: "EUR",
      bookedAt: "2026-09-05",
      matchStatus: "unmatched",
    },
  ],
};

const proposed: OutgoingLine[] = [
  {
    source: "pliant",
    id: "tx-queue",
    party: "MONDRIAN BORDEAUX",
    amount: 1280,
    currency: "EUR",
    eurAmount: 1280,
    refund: false,
    occurredOn: "2026-09-02",
    card: "Mondrian Bordeaux ···· 4321",
    text: "",
    kind: "Carte",
    agencyCard: false,
    cardInfo: null,
    suggestions: [],
  },
  {
    source: "revolut",
    id: "rev-1",
    party: "HOTEL",
    amount: 500,
    currency: "EUR",
    eurAmount: 500,
    refund: false,
    occurredOn: "2026-09-01",
    card: null,
    text: "TB-2026-0034",
    kind: "Virement",
    agencyCard: false,
    cardInfo: null,
    suggestions: [],
  },
];

test("une dépense de carte devient une sortie : achat positif, remboursement négatif", () => {
  const purchase = pliantSpendToOutgoing(card, card.spends[1]);
  assert.equal(purchase?.eurAmount, 98);
  assert.equal(purchase?.refund, false);
  assert.equal(purchase?.card, "Mondrian Bordeaux ···· 4321");
  assert.equal(purchase?.occurredOn, "2026-09-03");
  const refund = pliantSpendToOutgoing(card, card.spends[2]);
  assert.equal(refund?.eurAmount, -20);
  assert.equal(refund?.refund, true);
  assert.equal(refund?.kind, "Remboursement");
});

test("la liste à rattacher ne répète pas une transaction déjà proposée, et laisse de côté le rapproché et le refusé", () => {
  const lines = pendingCostLines({ proposed, cards: [card], bookingId: "booking-1" });
  assert.deepEqual(
    lines.map((line) => `${line.source}:${line.id}`),
    ["pliant:tx-queue", "revolut:rev-1", "pliant:tx-card-only", "pliant:tx-refund"]
  );
});

test("chaque coût sait sur quelle ligne il est posé", () => {
  const cost = (id: string, sourceId: string, source: "pliant" | "revolut" = "pliant"): TripCost => ({
    id,
    bookingId: "booking-1",
    bookingItemId: null,
    source,
    sourceId,
    amountEur: 10,
    originalAmount: null,
    originalCurrency: null,
    supplier: null,
    occurredOn: null,
    instrument: null,
    instrumentDetail: null,
  });
  const placements = costPlacements({
    lines: [
      {
        transactionId: "t1",
        itemId: "item-1",
        label: "Mondrian Bordeaux",
        nature: "item",
        sale: 1500,
        cost: 10,
        margin: 1490,
        costs: [cost("c1", "tx-done")],
      },
    ],
    unsold: [cost("c2", "rev-9", "revolut")],
  });
  assert.equal(placements.get("pliant:tx-done")?.lineLabel, "Mondrian Bordeaux");
  assert.equal(placements.get("revolut:rev-9")?.lineLabel, null);
  const legacy = revolutLinkedWithoutCost([{ id: "rev-9" }, { id: "rev-old" }], placements);
  assert.deepEqual(legacy.map((row) => row.id), ["rev-old"]);
});

test("Transavia 2 391,01 € : refus, annulation et autorisation couverte sortent de la liste du dossier", () => {
  const dossier = "tb-2026-0159";
  const day = "2026-11-10";
  const attempt = (id: string, status: string, cardId: string): PliantCardRecap["spends"][number] => ({
    id,
    cardId,
    merchant: status === "BOOKED" ? "Transavia" : "TRANSAVIA",
    status,
    type: "PURCHASE",
    billingCents: status === "BOOKED" ? 239101 : -239101,
    currency: "EUR",
    bookedAt: day,
    matchStatus: status === "BOOKED" ? "matched" : "unmatched",
    matchedBookingId: status === "BOOKED" ? dossier : null,
  });
  const first: PliantCardRecap = {
    ...card,
    pliantCardId: "card-bloquee",
    label: "Transavia · carte 1",
    last4: "1111",
    spends: [attempt("auth-1", "CONFIRMED", "card-bloquee"), attempt("auth-2", "CONFIRMED", "card-bloquee"), attempt("declined-1", "DECLINED", "card-bloquee"), attempt("reversed-1", "REVERSED", "card-bloquee")],
  };
  const second: PliantCardRecap = {
    ...card,
    pliantCardId: "card-debitee",
    label: "Transavia · carte 2",
    last4: "2222",
    spends: [attempt("debit-1", "BOOKED", "card-debitee")],
  };
  const proposed: OutgoingLine[] = [
    {
      source: "pliant",
      id: "auth-1",
      party: "TRANSAVIA",
      amount: 2391.01,
      currency: "EUR",
      eurAmount: 2391.01,
      refund: false,
      occurredOn: day,
      card: "···· 1111",
      text: "",
      kind: "Carte",
      agencyCard: false,
      cardInfo: null,
      suggestions: [],
    },
    {
      source: "pliant",
      id: "open-auth",
      party: "AUTRE",
      amount: 12,
      currency: "EUR",
      eurAmount: 12,
      refund: false,
      occurredOn: day,
      card: null,
      text: "",
      kind: "Carte",
      agencyCard: false,
      cardInfo: null,
      suggestions: [],
    },
  ];
  const openCard: PliantCardRecap = {
    ...card,
    pliantCardId: "card-ouverte",
    spends: [attempt("open-auth", "CONFIRMED", "card-ouverte")].map((row) => ({ ...row, merchant: "AUTRE", billingCents: -1200 })),
  };
  const hidden = pendingCostLines({
    proposed: proposed.filter((line) => line.id === "auth-1"),
    cards: [first, second],
    bookingId: dossier,
  });
  assert.deepEqual(hidden.map((line) => line.id), []);
  const kept = pendingCostLines({ proposed, cards: [first, second, openCard], bookingId: dossier });
  assert.deepEqual(kept.map((line) => line.id), ["open-auth"]);
});
