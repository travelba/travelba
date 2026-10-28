import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountLines,
  isFixedCostParty,
  marginByTransaction,
  referenceInText,
  saleLines,
  settlementLabel,
  costSuggestionReasonLabel,
  isOwnAccountTransfer,
  pliantSpendSettlement,
  suggestCostTargets,
  suggestItem,
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
    instrument: "pliant_card",
    instrumentDetail: null,
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
      card_last4: "5454",
    };
    const draft = tripCostFromPliant(base);
    assert.ok(draft);
    assert.equal(draft.instrument, "pliant_card");
    assert.equal(draft.instrumentDetail, "5454");
    assert.equal(settlementLabel(draft), "Carte Pliant ···· 5454");
    assert.equal(draft.amountEur, 850.5);
    assert.equal(draft.originalAmount, 9200);
    assert.equal(draft.originalCurrency, "MAD");
    assert.equal(draft.supplier, "RIAD KNIZA");
    assert.equal(draft.occurredOn, "2026-10-02");
    const refund = tripCostFromPliant({ ...base, type: "REFUND", billing_cents: -10000 });
    assert.equal(refund?.amountEur, -100);
    assert.equal(tripCostFromPliant({ ...base, status: "DECLINED" }), null);
    assert.equal(tripCostFromPliant({ ...base, status: "PENDING" }), null);
    assert.equal(tripCostFromPliant({ ...base, type: "STATUS_INQUIRY" }), null);
    const pending = pliantSpendSettlement({
      ...base,
      id: "coral",
      status: "PENDING",
      merchant: "WWW.CORALTHAILAND.COM",
      billing_cents: -24082,
      transaction_cents: -900000,
      transaction_currency: "THB",
    });
    assert.equal(pending?.state, "pending");
    assert.equal(pending?.draft.amountEur, 240.82);
    assert.equal(pending?.draft.originalAmount, 9000);
    assert.equal(pending?.draft.originalCurrency, "THB");
    const settled = pliantSpendSettlement({ ...base, billing_cents: -24100 });
    assert.equal(settled?.state, "posted");
    assert.equal(settled?.draft.amountEur, 241);
  });

  it("prend le montant en euros d’une sortie Revolut, sinon le coût saisi", () => {
    const eur = tripCostFromRevolut({ id: "r1", direction: "debit", amount: -300, currency: "EUR", counterparty_name: "Air France", booked_at: "2026-10-03", raw: { type: "transfer" } });
    assert.equal(eur?.amountEur, 300);
    assert.equal(eur?.instrument, "revolut_transfer");
    assert.equal(settlementLabel(eur!), "Virement Revolut");
    const card = tripCostFromRevolut({ id: "r1b", direction: "debit", amount: -30, currency: "EUR", counterparty_name: "Uber", booked_at: null, raw: { type: "card_payment" } });
    assert.equal(card?.instrument, "revolut_card");
    assert.equal(settlementLabel(card!), "Carte bancaire Revolut");
    const other = tripCostFromRevolut({ id: "r1c", direction: "debit", amount: -30, currency: "EUR", counterparty_name: "Uber", booked_at: null });
    assert.equal(other?.instrument, "revolut_other");
    assert.equal(settlementLabel(other!), "Revolut");
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
      cost({ id: "c", bookingItemId: FLIGHT, amountEur: 450, supplier: "AIR FRANCE", instrument: "revolut_transfer", occurredOn: "2026-10-03" }),
    ]);
    const hotel = accounted.find((line) => line.transactionId === "t-hotel");
    assert.equal(hotel?.cost, 850);
    assert.equal(hotel?.margin, 350);
    const flight = accounted.find((line) => line.transactionId === "t-flight");
    assert.equal(flight?.margin, -50);
    assert.equal(unsold.length, 0);
    const totals = tripTotals(accounted, unsold);
    assert.deepEqual(totals, { sale: 1760, cost: 1300, direct: 460, commission: 0, margin: 460, unsoldCost: 0 });
    const withCommission = accountLines(lines, [
      cost({ id: "a", bookingItemId: HOTEL, amountEur: 900, supplier: "RIAD" }),
    ], [{ itemId: HOTEL, attendue: 120, recue: null }]);
    const hotelCommission = withCommission.lines.find((line) => line.transactionId === "t-hotel");
    assert.equal(hotelCommission?.direct, 300);
    assert.equal(hotelCommission?.commission, 120);
    assert.equal(hotelCommission?.commissionKind, "attendue");
    assert.equal(hotelCommission?.margin, 420);
    const received = accountLines(lines, [
      cost({ id: "a", bookingItemId: HOTEL, amountEur: 900, supplier: "RIAD" }),
    ], [{ itemId: HOTEL, attendue: 120, recue: 80 }]);
    assert.equal(received.lines.find((line) => line.transactionId === "t-hotel")?.margin, 380);
    assert.equal(received.lines.find((line) => line.transactionId === "t-hotel")?.commissionKind, "recue");
    const margins = marginByTransaction(accounted);
    // Le mode de règlement reste au CRM : rien de plus que la marge et les fournisseurs ne part à MB3M.
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
    const pending = cost({ id: "pending:coral", amountEur: 240.82, state: "pending" });
    const posted = cost({ id: "booked", amountEur: 100, state: "posted" });
    const waiting = accountLines(saleLines(ledger, BOOKING), [pending, posted]);
    assert.equal(waiting.unsold.some((row) => row.id === "pending:coral"), true);
    const totals = tripTotals(waiting.lines, waiting.unsold);
    assert.equal(totals.unsoldCost, 100);
    assert.equal(totals.margin, roundSale(waiting.lines) - 100);
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
    // La carte d’un client connu propose son voyage autour de la date, même sans fournisseur reconnu.
    const own = [
      { id: "b4", reference: "TB-2026-0004", title: "Hiver", customerId: "c1", startDate: "2026-02-01", endDate: "2026-02-08", items: [] },
      { id: "b5", reference: "TB-2026-0005", title: "40 ans", customerId: "c1", startDate: "2026-10-08", endDate: "2026-10-11", items: [] },
      { id: "b6", reference: "TB-2026-0006", title: "Autre", customerId: "c2", startDate: "2026-10-09", endDate: "2026-10-12", items: [] },
    ];
    const byClient = suggestCostTargets({ text: "", party: "WINXO JNANE OUMNAS", amount: 453.41, customerId: "c1", date: "2026-10-11" }, own);
    assert.deepEqual(byClient.map((hit) => [hit.bookingId, hit.reason]), [["b5", "client"]]);
    // Hors fenêtre : tous les voyages du client, à l’agent de choisir.
    assert.equal(suggestCostTargets({ text: "", party: "X", amount: 1, customerId: "c1", date: "2026-06-01" }, own).length, 2);
    // Le prélèvement IATA (BSP) regroupe tous les billets : jamais de proposition, même au montant.
    assert.deepEqual(suggestCostTargets({ text: "", party: "IATA ESPAGNA SL", amount: 850.5 }, bookings), []);
    assert.deepEqual(suggestCostTargets({ text: "TB-2026-0002", party: "IATA ESPAGNA SL", amount: 1, cardBookingIds: ["b1"] }, bookings), []);
    // Le virement de trésorerie vers Pliant (vers l’agence elle-même) non plus.
    assert.deepEqual(suggestCostTargets({ text: "treso Rev - pliant", party: "Travel Business Agency sasu", amount: 850.5 }, bookings), []);
    assert.deepEqual(suggestCostTargets({ text: "", party: "PLIANT", amount: 850.5 }, bookings), []);
    // Coûts fixes de l’agence : logiciels, IA, téléphonie. Jamais proposés, jamais montrés.
    for (const party of ["OpenAI", "Cursor", "Vercel", "Google Workspace", "GOOGLE *CHROME TEMP", "Anthropic", "Perplexity", "eSIMo", "Free Mobile", "FREE TELECOM"]) {
      assert.equal(isFixedCostParty(party), true, party);
      assert.deepEqual(suggestCostTargets({ text: "", party, amount: 850.5 }, bookings), [], party);
    }
    for (const party of ["DUTY FREE PARIS", "AIR FRANCE", "HASSLER ROMA", "FREELANCE DJ"]) assert.equal(isFixedCostParty(party), false, party);
  });

  it("ne propose pas From treso à Anantara, et ne prétend un nom que s’il est vraiment là", () => {
    const phuket = [
      {
        id: "6ca304b2-ed11-4a68-882f-e6833b07359d",
        reference: "TB-2026-0088",
        title: "Phuket & Krabi",
        items: [
          {
            id: "anantara",
            kind: "hotel",
            title: "Anantara Layan Phuket Resort",
            supplier: "Little Emperors",
            amount: 21842.11,
            details: { hotel_name: "Anantara Layan Phuket Resort" },
          },
          {
            id: "phulay",
            kind: "hotel",
            title: "Phulay Bay, a Ritz-Carlton Reserve",
            supplier: "Little Emperors",
            amount: 17162.28,
            details: { hotel_name: "Phulay Bay, a Ritz-Carlton Reserve" },
          },
          { id: "flight", kind: "flight", title: "Paris → Phuket", supplier: "Air France", amount: 6669 },
        ],
      },
    ];
    const supplierSentence = "Le nom du fournisseur correspond à cette prestation.";
    assert.equal(costSuggestionReasonLabel("supplier"), supplierSentence);
    for (const example of [
      { party: "From treso", text: "", amount: 5000 },
      { party: "From treso", text: "", amount: 15000 },
      { party: "From treso", text: "From treso", amount: 5000 },
      { party: "treso", text: "To treso", amount: 10000 },
      { party: "To treso", text: "", amount: 7000 },
      { party: "EUR Main", text: "To EUR Main", amount: 2800 },
      { party: "Qonto", text: "Virement interne", amount: 5000 },
    ]) {
      const hits = suggestCostTargets(example, phuket);
      assert.equal(hits.length, 0, `${example.party} ${example.amount}`);
      assert.equal(
        hits.map((hit) => costSuggestionReasonLabel(hit.reason)).includes(supplierSentence),
        false,
        example.party
      );
    }
    assert.equal(suggestItem(phuket[0], { party: "From treso", amount: 5000 }).reason, null);
    assert.equal(isOwnAccountTransfer({ party: "From treso", text: "" }), true);
    assert.equal(
      isOwnAccountTransfer({
        party: "EUR Main",
        text: "To EUR Main",
        raw: {
          type: "transfer",
          legs: [
            { account_id: "a9d3877d-5707-e25d-00c0-353b087b6c17", description: "To EUR Main", amount: -2800 },
            { account_id: "ec33edb7-412b-e2f7-00c0-3576ad72045d", amount: 2800 },
          ],
        },
      }),
      true
    );
    const named = suggestCostTargets({ text: "", party: "ANANTARA LAYAN", amount: 1 }, phuket);
    assert.equal(named[0]?.itemId, "anantara");
    assert.equal(named[0]?.reason, "supplier");
    assert.equal(costSuggestionReasonLabel(named[0].reason), supplierSentence);
    const france = suggestCostTargets({ text: "", party: "AIRFRANCE", amount: 62.15 }, phuket);
    assert.equal(france[0]?.itemId, "flight");
    assert.equal(france[0]?.reason, "supplier");
    assert.equal(suggestCostTargets({ text: "", party: "HIVERNAGE MARRAKECH", amount: 1 }, [
      { id: "b3", reference: "TB-2026-0003", title: "Marrakech", items: [{ id: "i4", kind: "hotel", title: "Hivernage Hotel And Spa", amount: 2000 }] },
    ])[0]?.itemId, "i4");
    assert.equal(suggestItem(phuket[0], { party: "To Europe Hotel", amount: 5000 }).reason, null);
    assert.equal(isOwnAccountTransfer({ party: "To Europe Hotel", text: "" }), false);
    const taxi = suggestCostTargets({ text: "", party: "TAXI2AIRPORT.COM B.V.", amount: 41.19 }, phuket);
    assert.equal(taxi.length, 0);
    assert.equal(
      taxi.map((hit) => costSuggestionReasonLabel(hit.reason)).includes(supplierSentence),
      false
    );
  });
});

function roundSale(lines: { sale: number; cost: number }[]) {
  return Math.round(lines.reduce((sum, line) => sum + line.sale - line.cost, 0) * 100) / 100;
}
