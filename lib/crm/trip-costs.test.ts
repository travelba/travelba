import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountLines,
  marginByTransaction,
  referenceInText,
  saleLines,
  suggestCostTargets,
  tripAccountingState,
  tripCostFromPliant,
  tripCostFromRevolut,
  tripTotals,
  type TripCost,
} from "./trip-costs";

const BOOKING = "b1";
const HOTEL = "11111111-1111-1111-1111-111111111111";
const FLIGHT = "22222222-2222-2222-2222-222222222222";

function cost(partial: Partial<TripCost>): TripCost {
  return {
    id: partial.id || "c",
    bookingId: BOOKING,
    bookingItemId: null,
    source: "pliant",
    sourceId: partial.id || "c",
    amountEur: 0,
    originalAmount: null,
    originalCurrency: "EUR",
    supplier: null,
    occurredOn: null,
    ...partial,
  };
}

const ledger = [
  { id: "t-hotel", booking_id: BOOKING, direction: "debit", kind: "booking", status: "posted", currency: "EUR", amount: 1200, label: "Hôtel · Riad — TB-2026-0001", external_id: `booking:${BOOKING}:item:${HOTEL}` },
  { id: "t-flight", booking_id: BOOKING, direction: "debit", kind: "booking", status: "posted", currency: "EUR", amount: 400, label: "Vol · AF — TB-2026-0001", external_id: `booking:${BOOKING}:item:${FLIGHT}` },
  { id: "t-fee", booking_id: BOOKING, direction: "debit", kind: "fee", status: "posted", currency: "EUR", amount: 160, label: "Frais d’agence", external_id: `booking:${BOOKING}:agency-commission` },
  { id: "t-credit", booking_id: BOOKING, direction: "credit", kind: "transfer", status: "posted", currency: "EUR", amount: 500, label: "Virement", external_id: null },
  { id: "t-other", booking_id: "b2", direction: "debit", kind: "booking", status: "posted", currency: "EUR", amount: 99, label: "Autre", external_id: null },
];

describe("coûts du voyage", () => {
  it("lit une dépense Pliant comptabilisée, négative pour un remboursement", () => {
    const base = {
      id: "p1",
      status: "BOOKED",
      type: "PURCHASE",
      merchant: "RIAD KNIZA",
      billing_cents: 85050,
      billing_currency: "EUR",
      transaction_cents: 920000,
      transaction_currency: "MAD",
      booked_at: "2026-10-02T10:00:00Z",
    };
    const draft = tripCostFromPliant(base);
    assert.ok(draft);
    assert.equal(draft.amountEur, 850.5);
    assert.equal(draft.originalAmount, 9200);
    assert.equal(draft.originalCurrency, "MAD");
    assert.equal(draft.supplier, "RIAD KNIZA");
    assert.equal(draft.occurredOn, "2026-10-02");
    const refund = tripCostFromPliant({ ...base, type: "REFUND", billing_cents: -10000 });
    assert.equal(refund?.amountEur, -100);
    assert.equal(tripCostFromPliant({ ...base, status: "DECLINED" }), null);
    assert.equal(tripCostFromPliant({ ...base, type: "STATUS_INQUIRY" }), null);
  });

  it("prend le montant en euros d’une sortie Revolut, sinon le coût saisi", () => {
    const eur = tripCostFromRevolut({ id: "r1", direction: "debit", amount: -300, currency: "EUR", counterparty_name: "Air France", booked_at: "2026-10-03" });
    assert.equal(eur?.amountEur, 300);
    const usd = tripCostFromRevolut({ id: "r2", direction: "debit", amount: 500, currency: "USD", counterparty_name: "Hotel", booked_at: null });
    assert.equal(usd, null);
    const typed = tripCostFromRevolut({ id: "r2", direction: "debit", amount: 500, currency: "USD", counterparty_name: "Hotel", booked_at: null }, 460);
    assert.equal(typed?.amountEur, 460);
    assert.equal(typed?.originalCurrency, "USD");
    const refund = tripCostFromRevolut({ id: "r3", direction: "credit", amount: 120, currency: "EUR", counterparty_name: "Hotel", booked_at: null });
    assert.equal(refund?.amountEur, -120);
  });

  it("une vente par débit posté du dossier, le coût rejoint sa carte, la marge peut être négative", () => {
    const lines = saleLines(ledger, BOOKING);
    assert.deepEqual(lines.map((line) => [line.transactionId, line.itemId, line.nature]), [
      ["t-hotel", HOTEL, "item"],
      ["t-flight", FLIGHT, "item"],
      ["t-fee", null, "fee"],
    ]);
    const { lines: accounted, unsold } = accountLines(lines, [
      cost({ id: "a", bookingItemId: HOTEL, amountEur: 900, supplier: "RIAD" }),
      cost({ id: "b", bookingItemId: HOTEL, amountEur: -50, supplier: "RIAD" }),
      cost({ id: "c", bookingItemId: FLIGHT, amountEur: 450, supplier: "AIR FRANCE" }),
    ]);
    const hotel = accounted.find((line) => line.transactionId === "t-hotel");
    assert.equal(hotel?.cost, 850);
    assert.equal(hotel?.margin, 350);
    const flight = accounted.find((line) => line.transactionId === "t-flight");
    assert.equal(flight?.margin, -50);
    assert.equal(unsold.length, 0);
    const totals = tripTotals(accounted, unsold);
    assert.deepEqual(totals, { sale: 1760, cost: 1300, margin: 460, unsoldCost: 0 });
    const margins = marginByTransaction(accounted);
    assert.deepEqual(margins.get("t-flight"), { margin: -50, suppliers: ["AIR FRANCE"] });
  });

  it("sans carte au grand livre, le coût rejoint le montant du séjour ; sans séjour, il reste hors vente", () => {
    const stay = [
      { id: "t-stay", booking_id: BOOKING, direction: "debit", kind: "booking", status: "posted", currency: "EUR", amount: 2000, label: "Séjour", external_id: null },
    ];
    const withStay = accountLines(saleLines(stay, BOOKING), [cost({ id: "a", amountEur: 1500 })]);
    assert.equal(withStay.lines[0].cost, 1500);
    assert.equal(withStay.unsold.length, 0);
    const hidden = accountLines(saleLines([], BOOKING), [cost({ id: "a", amountEur: 1500 })]);
    assert.equal(hidden.lines.length, 0);
    assert.equal(hidden.unsold.length, 1);
    assert.equal(tripTotals(hidden.lines, hidden.unsold).unsoldCost, 1500);
  });

  it("état du voyage : à pointer, pointé, comptabilisé", () => {
    assert.equal(tripAccountingState({ proposedCount: 1, unsoldCount: 0, invoiceNumber: "12", invoicePrinted: true, marginStale: false }), "a_pointer");
    assert.equal(tripAccountingState({ proposedCount: 0, unsoldCount: 0, invoiceNumber: null, invoicePrinted: false, marginStale: false }), "pointe");
    assert.equal(tripAccountingState({ proposedCount: 0, unsoldCount: 0, invoiceNumber: "12", invoicePrinted: true, marginStale: true }), "pointe");
    assert.equal(tripAccountingState({ proposedCount: 0, unsoldCount: 0, invoiceNumber: "12", invoicePrinted: true, marginStale: false }), "comptabilise");
  });

  it("propose le dossier par référence, carte, fournisseur puis montant, sans écrire", () => {
    const bookings = [
      {
        id: "b1",
        reference: "TB-2026-0001",
        title: "Marrakech",
        items: [
          { id: HOTEL, kind: "hotel", title: "Riad Kniza", amount: 1200, details: { hotel_name: "Riad Kniza" } },
          { id: FLIGHT, kind: "flight", title: "Paris → Marrakech", supplier: "Air France", amount: 400 },
        ],
      },
      {
        id: "b2",
        reference: "TB-2026-0002",
        title: "Rome",
        items: [{ id: "i3", kind: "hotel", title: "Hassler", amount: 850.5 }],
      },
    ];
    assert.equal(referenceInText("Virement TB-2026-0002 acompte"), "TB-2026-0002");
    const byReference = suggestCostTargets({ text: "Acompte tb-2026-0002", party: "HASSLER ROMA", amount: 300 }, bookings);
    assert.equal(byReference[0].bookingId, "b2");
    assert.equal(byReference[0].reason, "reference");
    assert.equal(byReference[0].itemId, "i3");
    const byCard = suggestCostTargets({ text: "", party: "UNKNOWN SHOP", amount: 12, cardBookingIds: ["b1"] }, bookings);
    assert.equal(byCard[0].reason, "card");
    assert.equal(byCard[0].itemId, null);
    const bySupplier = suggestCostTargets({ text: "", party: "AIR FRANCE PARIS", amount: 10 }, bookings);
    assert.equal(bySupplier[0].bookingId, "b1");
    assert.equal(bySupplier[0].itemId, FLIGHT);
    const byAmount = suggestCostTargets({ text: "", party: "XYZ", amount: 850.5 }, bookings);
    assert.equal(byAmount[0].bookingId, "b2");
    assert.equal(byAmount[0].reason, "amount");
    assert.deepEqual(suggestCostTargets({ text: "", party: "XYZ", amount: 1 }, bookings), []);
    // Un mot courant (hotel, spa, lodge) ne désigne pas un fournisseur.
    const spa = [{ id: "b3", reference: "TB-2026-0003", title: "Marrakech", items: [{ id: "i4", kind: "hotel", title: "Hivernage Hotel And Spa", amount: 2000 }] }];
    assert.deepEqual(suggestCostTargets({ text: "", party: "EL SILENCIO LODGE Y SPA", amount: 531.1 }, spa), []);
    assert.equal(suggestCostTargets({ text: "", party: "HIVERNAGE MARRAKECH", amount: 1 }, spa)[0]?.itemId, "i4");
  });
});
