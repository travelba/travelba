import assert from "node:assert/strict";
import test from "node:test";
import {
  linkedPliantTransactionIds,
  pliantBookingCards,
  pliantCardRecaps,
  pliantExpenseTitle,
  pliantExpenseTransactionId,
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
