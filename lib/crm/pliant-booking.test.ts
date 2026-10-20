import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingCardMosaic,
  linkedPliantTransactionIds,
  ownedBookingPliantCard,
  pliantBookingCards,
  pliantCardRecaps,
  pliantExpenseTitle,
  pliantExpenseTransactionId,
  pliantReconcileState,
  pliantSettlementStays,
  pliantSpendCopy,
} from "./pliant-booking";
import type { PliantSpendLine } from "./pliant-cards";

function spend(partial: Partial<PliantSpendLine> & Pick<PliantSpendLine, "id">): PliantSpendLine {
  return {
    cardId: "card-hotel",
    merchant: "Restaurant",
    status: "CONFIRMED",
    type: "PURCHASE",
    billingCents: 8600,
    currency: "EUR",
    bookedAt: "2026-03-12",
    ...partial,
  };
}

test("les cartes du dossier précèdent l’hôtel, et un même identifiant ne compte qu’une fois", () => {
  const cards = pliantBookingCards({
    bookingCards: [
      {
        pliant_card_id: "card-chauffeur",
        label: "Chauffeur",
        last4: "8811",
        limit_cents: 40000,
        currency: "EUR",
      },
      {
        pliant_card_id: "card-hotel",
        label: "Four Seasons",
        last4: "4242",
        limit_cents: 120000,
        currency: "EUR",
      },
    ],
    arrivals: [
      {
        pliant_card_id: "card-hotel",
        booking_item_id: "stay-1",
        card_last4: "9999",
        card_limit_cents: 100,
        currency: "EUR",
      },
      {
        pliant_card_id: "card-milan",
        booking_item_id: "stay-2",
        card_last4: "1111",
        card_limit_cents: 50000,
        currency: "eur",
      },
    ],
    hotelNames: { "stay-2": "Hôtel Milano" },
    registry: {
      pliant_card_id: "card-chauffeur",
      label: "Registre",
      last4: "0000",
      limit_cents: 1,
      currency: "EUR",
    },
  });
  assert.deepEqual(
    cards.map((card) => card.label),
    ["Chauffeur", "Four Seasons", "Hôtel Milano"]
  );
  assert.equal(cards[2]?.currency, "EUR");
  assert.equal(cards[2]?.last4, "1111");
});

test("le plafond hôtel est en euros et garde le montant d’origine", () => {
  const [card] = pliantBookingCards({
    bookingCards: [],
    arrivals: [
      {
        pliant_card_id: "card-sgd",
        booking_item_id: "stay-sgd",
        card_last4: "4242",
        card_limit_cents: 432045,
        currency: "SGD",
        task_note: "Origine 5907,49 SGD",
      },
    ],
    hotelNames: { "stay-sgd": "Raffles" },
    registry: null,
  });
  assert.equal(card?.currency, "EUR");
  assert.equal(card?.ceilingCents, 432045);
  assert.equal(card?.label, "Raffles · 5907,49 SGD");
});

test("la mosaïque aligne les cartes émises puis les cartes liées, sans doublon", () => {
  const slots = bookingCardMosaic(
    [
      { id: "row-day", pliant_card_id: "card-day", status: "active" },
      { id: "row-old", pliant_card_id: "card-old", status: "terminated" },
    ],
    [
      { pliantCardId: "card-day" },
      { pliantCardId: "card-old" },
      { pliantCardId: "card-bulles" },
      { pliantCardId: " card-bulles " },
    ]
  );
  assert.deepEqual(slots, [
    { source: "issued", id: "row-day" },
    { source: "linked", pliantCardId: "card-bulles" },
  ]);
});

test("un achat confirmé se copie, un refus, un remboursement ou un montant nul non", () => {
  assert.deepEqual(pliantSpendCopy(spend({ id: "a" })), { amount: 86, currency: "EUR" });
  assert.equal(pliantSpendCopy(spend({ id: "b", status: "DECLINED" })), null);
  assert.equal(pliantSpendCopy(spend({ id: "c", status: "REVERSED" })), null);
  assert.equal(pliantSpendCopy(spend({ id: "d", type: "REFUND", billingCents: 8600 })), null);
  assert.equal(pliantSpendCopy(spend({ id: "e", billingCents: 0 })), null);
  assert.equal(pliantSpendCopy(spend({ id: "f", billingCents: null })), null);
  assert.deepEqual(pliantSpendCopy(spend({ id: "g", status: "BOOKED", billingCents: -4200 })), {
    amount: 42,
    currency: "EUR",
  });
});

test("le récap groupe les dépenses par carte et additionne les achats", () => {
  const [card] = pliantBookingCards({
    bookingCards: [
      { pliant_card_id: "card-hotel", label: "Hôtel", last4: "4242", limit_cents: 120000, currency: "EUR" },
    ],
    arrivals: [],
    hotelNames: {},
    registry: null,
  });
  const recap = pliantCardRecaps(
    [card!],
    [
      spend({ id: "eat", billingCents: 8600 }),
      spend({ id: "taxi", merchant: "Taxi", status: "BOOKED", billingCents: 4200, bookedAt: "2026-03-11" }),
      spend({ id: "no", status: "DECLINED", billingCents: 10000 }),
      spend({ id: "other", cardId: "card-else", billingCents: 5000 }),
    ]
  );
  assert.equal(recap[0]?.spends.length, 3);
  assert.equal(recap[0]?.spentCents, 12800);
  assert.equal(pliantExpenseTitle("  Café  du  port  "), "Café du port");
  assert.equal(pliantExpenseTitle("   "), "Dépense");
});

test("le numéro s’ouvre seulement si la carte appartient au dossier et reste ouverte", () => {
  const base = {
    bookingCards: [] as { pliant_card_id: string; status: string | null }[],
    arrivals: [] as { booking_item_id: string; pliant_card_id: string | null; card_closed_at: string | null }[],
    registry: [] as { pliant_card_id: string; status: string | null }[],
  };
  assert.equal(ownedBookingPliantCard({ ...base, pliantCardId: "card-hotel" }), null);
  assert.deepEqual(
    ownedBookingPliantCard({
      ...base,
      pliantCardId: "card-hotel",
      arrivals: [{ booking_item_id: "stay-1", pliant_card_id: "card-hotel", card_closed_at: null }],
    }),
    { itemId: "stay-1" }
  );
  assert.deepEqual(
    ownedBookingPliantCard({
      ...base,
      pliantCardId: "card-hotel",
      arrivals: [{ booking_item_id: "stay-1", pliant_card_id: "card-hotel", card_closed_at: "2026-10-01" }],
      bookingCards: [{ pliant_card_id: "card-hotel", status: "active" }],
    }),
    { itemId: null }
  );
  assert.deepEqual(
    ownedBookingPliantCard({
      ...base,
      pliantCardId: "card-hotel",
      arrivals: [{ booking_item_id: "stay-1", pliant_card_id: "card-hotel", card_closed_at: "2026-10-01" }],
    }),
    { closed: true }
  );
  assert.deepEqual(
    ownedBookingPliantCard({
      ...base,
      pliantCardId: " card-compte ",
      registry: [{ pliant_card_id: "card-compte", status: "locked" }],
    }),
    { itemId: null }
  );
});

test("une dépense annulée ne bloque pas une nouvelle copie", () => {
  assert.equal(pliantExpenseTransactionId({ pliant_transaction_id: " tx-1 " }), "tx-1");
  assert.equal(pliantExpenseTransactionId({}), null);
  const filed = linkedPliantTransactionIds([
    { kind: "expense", lifecycle: "active", details: { pliant_transaction_id: "tx-1" } },
    { kind: "expense", lifecycle: "cancelled", details: { pliant_transaction_id: "tx-2" } },
    { kind: "hotel", details: { pliant_transaction_id: "tx-3" } },
  ]);
  assert.equal(filed.has("tx-1"), true);
  assert.equal(filed.has("tx-2"), false);
  assert.equal(filed.has("tx-3"), false);
});

test("le rapprochement distingue la réservation ouverte, une autre, et une ligne fermée", () => {
  const line = { type: "PURCHASE", status: "BOOKED", billingCents: 4200, billingCurrency: "EUR" };
  assert.equal(pliantReconcileState({ ...line, matchStatus: "unmatched" }, "stay-1"), "post");
  assert.equal(pliantReconcileState({ ...line, matchStatus: "matched" }, "stay-1"), "attach");
  assert.equal(
    pliantReconcileState({ ...line, matchStatus: "matched", matchedBookingId: "stay-1" }, "stay-1"),
    "here"
  );
  assert.equal(
    pliantReconcileState({ ...line, matchStatus: "matched", matchedBookingId: "stay-2" }, "stay-1"),
    "elsewhere"
  );
  assert.equal(pliantReconcileState({ ...line, matchStatus: "ignored" }, "stay-1"), "ignored");
  assert.equal(pliantReconcileState({ ...line, status: "DECLINED" }, "stay-1"), "closed");
  assert.equal(pliantReconcileState({ ...line, status: "PENDING" }, "stay-1"), "closed");
});

test("les réservations du compte gardent le séjour ouvert en tête", () => {
  const stays = pliantSettlementStays(
    [
      {
        id: "milan",
        reference: "TBA-2",
        title: "Milan",
        destination: null,
        start_date: "2026-08-01",
        status: "confirmed",
      },
      {
        id: "annule",
        reference: "TBA-X",
        title: "Lyon",
        destination: null,
        start_date: "2026-01-01",
        status: "cancelled",
      },
      {
        id: "rome",
        reference: "TBA-1",
        title: "Rome",
        destination: "Paris",
        start_date: "2026-06-01",
        status: "draft",
      },
    ],
    "rome"
  );
  assert.deepEqual(
    stays.map((stay) => stay.id),
    ["rome", "milan"]
  );
  assert.match(stays[0]?.label || "", /^TBA-1 · Rome · /);
  assert.equal(stays[0]?.label.includes("Paris"), false);
});
