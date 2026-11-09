import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hintsFromExtract, markDuplicateOutgoing } from "./cost-match";
import {
  accountLines,
  dossierClientLabel,
  dossierMatchLabel,
  costSuggestionSummary,
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
  type CostSuggestion,
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
    assert.deepEqual(totals, { sale: 1760, cost: 1300, margin: 460, unsoldCost: 0 });
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
    // La compagnie seule, sans le montant du billet, ne désigne pas un dossier.
    assert.deepEqual(suggestCostTargets({ text: "", party: "AIR FRANCE PARIS", amount: 10 }, bookings), []);
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
    // Hors fenêtre : pas de proposition. Un séjour du client sans la date ne suffit pas.
    assert.deepEqual(suggestCostTargets({ text: "", party: "X", amount: 1, customerId: "c1", date: "2026-06-01" }, own), []);
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
    // Un petit débit Air France (bagage, siège) ne propose pas le séjour au seul nom de la compagnie.
    assert.deepEqual(suggestCostTargets({ text: "", party: "AIRFRANCE", amount: 62.15 }, phuket), []);
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

  it("rapproche le montant, le PNR, l’hôtel et le lieu, et se tait si l’indice est faible", () => {
    const berda = {
      id: "berda",
      reference: "TB-2026-0148",
      title: "Famille Berda",
      destination: "Paris",
      travelers: [
        { first: "David", last: "Berda" },
        { first: "Sarah", last: "Berda" },
      ],
      items: [
        {
          id: "tickets",
          kind: "flight",
          title: "Paris → New York",
          supplier: "Air France",
          amount: 2108.96,
          confirmationRef: "YQYS8U",
          startAt: "2026-11-12",
          details: { airline: "Air France", pnr: "YQYS8U", document_amount: 2108.96, document_currency: "EUR" },
        },
      ],
    };
    const coupat = {
      id: "coupat",
      reference: "TB-2026-0100",
      title: "New York",
      destination: "New York",
      travelers: [{ first: "Camille", last: "Coupat" }],
      items: [
        {
          id: "ny",
          kind: "flight",
          title: "Paris → New York",
          supplier: "Air France",
          amount: 640,
          startAt: "2026-11-20",
          details: { airline: "Air France" },
        },
      ],
    };
    const air = suggestCostTargets(
      { text: "YQYS8U", party: "AIR FRANCE", amount: 2108.96, date: "2026-11-03" },
      [coupat, berda]
    );
    assert.equal(air[0]?.bookingId, "berda");
    assert.equal(air[0]?.itemId, "tickets");
    assert.equal(air[0]?.confidence, "haute");
    assert.equal(air[0]?.passengers.join(", "), "David Berda, Sarah Berda");
    assert.match(costSuggestionSummary(air[0]), /PNR/);
    assert.match(costSuggestionSummary(air[0]), /montant/);
    assert.equal(air.some((hit) => hit.bookingId === "coupat"), false);
    assert.deepEqual(suggestCostTargets({ party: "AIR FRANCE", amount: 72, date: "2026-11-03" }, [coupat, berda]), []);

    const corrot = {
      id: "corrot",
      reference: "TB-2026-0038",
      title: "Miami",
      destination: "Miami",
      travelers: [{ first: "Jean", last: "Corrot" }],
      items: [
        {
          id: "edition",
          kind: "hotel",
          title: "The Miami Beach Edition",
          amount: null,
          startAt: "2026-11-06",
          endAt: "2026-11-09",
          details: { hotel_name: "The Miami Beach Edition", city: "Miami", document_amount: 1157.25, document_currency: "USD" },
        },
      ],
      hints: { texts: ["Edition Hotels — confirmation for Mr Corrot, The Miami Beach Edition"] },
    };
    const khiari = {
      id: "khiari",
      reference: "TB-2026-0124",
      title: "Séjour",
      destination: "Con Dao",
      travelers: [{ first: "Amine", last: "Khiari" }],
      items: [
        {
          id: "condao",
          kind: "hotel",
          title: "Six Senses Con Dao",
          amount: 900,
          details: { hotel_name: "Six Senses Con Dao", city: "Con Dao" },
        },
      ],
    };
    const edition = suggestCostTargets(
      { party: "THE MIAMI BEACH EDITION", amount: 1060, originalAmount: 1157.25, originalCurrency: "USD", date: "2026-11-06" },
      [khiari, corrot]
    );
    assert.equal(edition[0]?.bookingId, "corrot");
    assert.equal(edition[0]?.passengers[0], "Jean Corrot");
    assert.match(costSuggestionSummary(edition[0]), /e-mail|hôtel|montant/);
    assert.equal(edition.some((hit) => hit.bookingId === "khiari"), false);

    const douro = {
      id: "douro",
      reference: "TB-2026-0200",
      title: "Douro",
      destination: "Douro",
      items: [{ id: "douro-hotel", kind: "hotel", title: "Six Senses Douro Valley", amount: 2000, details: { hotel_name: "Six Senses Douro Valley", city: "Douro" } }],
    };
    const valley = suggestCostTargets({ party: "SIX SENSES DOURO VALLEY", amount: 40 }, [khiari, douro]);
    assert.equal(valley[0]?.bookingId, "douro");
    assert.equal(valley[0]?.itemId, "douro-hotel");
    assert.equal(valley.some((hit) => hit.bookingId === "khiari"), false);

    const hints = hintsFromExtract({
      items: [{ confirmation_ref: "YQYS8U", document_amount: 527.24, document_currency: "EUR" }],
      travelers: [{ first_name: "Sarah", last_name: "Berda" }],
    });
    assert.deepEqual(hints.pnrs, ["YQYS8U"]);
    assert.equal(hints.amounts[0]?.value, 527.24);
    assert.equal(hints.names[0]?.last, "Berda");
  });

  it("nomme le dossier, le titulaire et la société à côté de la référence", () => {
    const face = {
      reference: "TB-2026-0148",
      title: "Mykonos – Bar Mitsvah Shon Bechet",
      clientName: "Shon Bechet",
      companyName: "Bechet Events",
    };
    assert.equal(dossierMatchLabel(face), "TB-2026-0148 · Mykonos – Bar Mitsvah Shon Bechet · Shon Bechet · Bechet Events");
    assert.equal(dossierClientLabel(face), "Shon Bechet · Bechet Events");
    assert.equal(dossierClientLabel({ clientName: "Shon Bechet", companyName: "Shon Bechet" }), "Shon Bechet");
    assert.equal(dossierMatchLabel({ reference: "TB-2026-0001", title: "", clientName: null, companyName: null }), "TB-2026-0001");
  });

  it("retient le billet Air France au montant du dossier, même si un autre e-mail cite le même chiffre", () => {
    const cymerman = {
      id: "cym",
      reference: "TB-2026-0155",
      title: "Tel Aviv",
      destination: "Tel Aviv",
      startDate: "2026-11-26",
      endDate: "2026-12-03",
      travelers: [{ first: "Arnaud", last: "Cymerman" }],
      items: [
        {
          id: "out",
          kind: "flight",
          title: "CDG → TLV",
          supplier: "Air France",
          amount: 2108.96,
          confirmationRef: "ZFSB6K",
          startAt: "2026-11-26",
          details: { pnr: "ZFSB6K", airline: "Air France", airline_iata: "AF", flight_number: "AF962", amount_is_total: true },
        },
        {
          id: "back",
          kind: "flight",
          title: "TLV → CDG",
          supplier: "Air France",
          amount: 0,
          confirmationRef: "ZFSB6K",
          startAt: "2026-12-03",
          details: { pnr: "ZFSB6K", airline: "Air France", airline_iata: "AF", flight_number: "AF975", amount_is_total: true },
        },
        {
          id: "exp",
          kind: "expense",
          title: "Billets Air France ZFSB6K",
          supplier: "Air France",
          amount: 2108.96,
          confirmationRef: "ZFSB6K",
          details: { pnr: "ZFSB6K", airline: "Air France", document_amount: 2108.96, document_currency: "EUR" },
        },
      ],
    };
    const decoy = {
      id: "decoy",
      reference: "TB-2026-0099",
      title: "Rome",
      destination: "Rome",
      items: [{ id: "af", kind: "flight", title: "CDG → FCO", supplier: "Air France", amount: 400, details: { airline: "Air France" } }],
      hints: { amounts: [{ value: 2108.96, currency: "EUR" }], texts: ["E-ticket Air France 2108,96 €"] },
    };
    const hits = suggestCostTargets(
      { party: "AIR FRANCE", amount: 2108.96, originalAmount: 2108.96, originalCurrency: "EUR", date: "2026-11-06" },
      [decoy, cymerman]
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.bookingId, "cym");
    assert.equal(hits[0]?.confidence, "haute");
    assert.equal(hits[0]?.reasons.includes("amount"), true);
    assert.equal(hits[0]?.reasons.includes("airline"), true);
    assert.equal(hits[0]?.passengers[0], "Arnaud Cymerman");
  });

  it("compare le débit en dollars au coût net hôtel, pas au prix de vente en euros", () => {
    const corrot = {
      id: "corrot",
      reference: "TB-2026-0038",
      title: "Miami Beach",
      destination: "Miami Beach",
      travelers: [{ first: "Charles", last: "Corrot" }],
      items: [
        {
          id: "edition",
          kind: "hotel",
          title: "The Miami Beach EDITION",
          amount: 9757,
          details: {
            hotel_name: "The Miami Beach EDITION",
            city: "Miami Beach",
            supplier_net: 1157.25,
            supplier_currency: "USD",
            document_amount: 12937,
          },
        },
      ],
    };
    const otherMiami = {
      id: "other",
      reference: "TB-2026-0124",
      title: "Miami",
      destination: "Miami",
      items: [
        {
          id: "other-hotel",
          kind: "hotel",
          title: "Fontainebleau Miami Beach",
          amount: 4000,
          details: { hotel_name: "Fontainebleau Miami Beach", city: "Miami" },
        },
      ],
    };
    const hits = suggestCostTargets(
      { party: "THE MIAMI BEACH EDITION", amount: 1035.66, originalAmount: 1157.25, originalCurrency: "USD", date: "2026-11-04" },
      [otherMiami, corrot]
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.bookingId, "corrot");
    assert.equal(hits[0]?.itemId, "edition");
    assert.equal(hits[0]?.confidence, "haute");
    assert.equal(hits[0]?.reasons.includes("amount"), true);
  });

  it("reconnaît El Al comme une expression, ou le code LY, et les EMD au centime", () => {
    const limor = {
      id: "limor",
      reference: "TB-2026-0156",
      title: "CDG → TLV",
      destination: "Tel Aviv",
      startDate: "2026-11-20",
      travelers: [{ first: "Limor", last: "Bechet" }],
      items: [
        {
          id: "out",
          kind: "flight",
          title: "CDG → TLV",
          supplier: "El Al",
          amount: 1901.74,
          confirmationRef: "ZDKRU6",
          startAt: "2026-11-20",
          details: { airline: "El Al", pnr: "ZDKRU6", airline_iata: "LY", flight_number: "LY315" },
        },
        {
          id: "back",
          kind: "flight",
          title: "TLV → CDG",
          supplier: "ELAL",
          amount: 0,
          confirmationRef: "ZDKRU6",
          details: { airline: "El Al", pnr: "ZDKRU6" },
        },
        {
          id: "emd",
          kind: "expense",
          title: "EMD El Al ZDKRU6 – BECHET Limor",
          supplier: "El Al",
          amount: 107.01,
          confirmationRef: "ZDKRU6",
          details: { pnr: "ZDKRU6", document_amount: 107.01, document_currency: "EUR" },
        },
        {
          id: "seats",
          kind: "expense",
          title: "EMD sièges El Al ZDKRU6 – BECHET Limor",
          supplier: "El Al",
          amount: 178.02,
          confirmationRef: "ZDKRU6",
          details: { pnr: "ZDKRU6", document_amount: 178.02, document_currency: "EUR" },
        },
      ],
    };
    const sameAmount = {
      id: "other",
      reference: "TB-2026-0200",
      title: "Autre",
      items: [{ id: "fee", kind: "expense", title: "Frais", amount: 107.01, details: { document_amount: 107.01, document_currency: "EUR" } }],
    };
    const almenara = {
      id: "almenara",
      reference: "TB-2026-0201",
      title: "Hôtel Almenara",
      destination: "Marbella",
      items: [{ id: "hotel", kind: "hotel", title: "Hotel Almenara", supplier: "Hotel Almenara", amount: 107.01, details: { hotel_name: "Hotel Almenara" } }],
    };
    const bag = suggestCostTargets({ party: "El Al", amount: 107.01, originalCurrency: "EUR", date: "2026-11-09" }, [sameAmount, almenara, limor]);
    assert.equal(bag.length, 1);
    assert.equal(bag[0]?.bookingId, "limor");
    assert.equal(bag[0]?.itemId, "emd");
    assert.equal(bag[0]?.confidence, "haute");
    assert.equal(bag[0]?.reasons.includes("airline"), true);
    const seats = suggestCostTargets({ party: "ELAL", amount: 178.02, originalCurrency: "EUR" }, [limor]);
    assert.equal(seats[0]?.bookingId, "limor");
    assert.equal(seats[0]?.itemId, "seats");
    assert.equal(seats[0]?.confidence, "haute");
    const fare = suggestCostTargets({ party: "LY315", amount: 1901.74, originalCurrency: "EUR" }, [limor, almenara]);
    assert.equal(fare[0]?.bookingId, "limor");
    assert.equal(fare[0]?.reasons.includes("airline"), true);
    const hotel = suggestCostTargets({ party: "HOTEL ALMENARA", amount: 107.01, originalCurrency: "EUR" }, [limor, sameAmount, almenara]);
    assert.equal(hotel.some((hit) => hit.bookingId === "limor"), false);
    assert.equal(hotel.some((hit) => hit.reasons.includes("airline")), false);
  });

  it("reprend le même dossier pour un second débit identique, en le signalant comme doublon", () => {
    const hit: CostSuggestion = {
      bookingId: "limor",
      itemId: "out",
      score: 90,
      reason: "supplier",
      reasons: ["amount", "airline"],
      passengers: ["Limor Bechet"],
      confidence: "haute",
    };
    const [first, second, other] = markDuplicateOutgoing([
      { id: "booked", party: "El Al", amount: 1901.74, currency: "EUR", suggestions: [hit] },
      { id: "declined", party: "EL AL", amount: 1901.74, currency: "EUR", suggestions: [] },
      { id: "emd", party: "El Al", amount: 107.01, currency: "EUR", suggestions: [{ ...hit, itemId: "emd", score: 90 }] },
    ]);
    assert.equal(first.suggestions[0]?.confidence, "haute");
    assert.equal(first.suggestions[0]?.reasons.includes("duplicate"), false);
    assert.equal(second.suggestions[0]?.bookingId, "limor");
    assert.equal(second.suggestions[0]?.confidence, "basse");
    assert.ok(second.suggestions[0] && second.suggestions[0].score < 90);
    assert.match(costSuggestionSummary(second.suggestions[0]!), /montant déjà proposé pour une autre sortie – doublon possible/i);
    assert.equal(other.suggestions[0]?.confidence, "haute");
    assert.equal(other.suggestions[0]?.reasons.includes("duplicate"), false);
  });

  it("rattache la carte au nom du client, même si un hôtel d’un autre dossier porte le même fournisseur", () => {
    const elad = (partial: {
      id: string;
      reference: string;
      title: string;
      startDate: string;
      endDate: string;
      amount?: number;
    }) => ({
      id: partial.id,
      reference: partial.reference,
      title: partial.title,
      destination: partial.title,
      customerId: "elad",
      clientName: "Elad Taieb",
      clientFirst: "Elad",
      clientLast: "Taieb",
      startDate: partial.startDate,
      endDate: partial.endDate,
      createdAt: "2026-10-31",
      items: partial.amount
        ? [{ id: `${partial.id}-fee`, kind: "expense", title: "Frais", amount: partial.amount, details: { document_amount: partial.amount, document_currency: "EUR" } }]
        : [],
    });
    const bajos = elad({ id: "119", reference: "TB-2026-0119", title: "Bajos del Toro", startDate: "2026-07-28", endDate: "2026-07-30" });
    const cabo = elad({ id: "120", reference: "TB-2026-0120", title: "Cabo Velas", startDate: "2026-08-07", endDate: "2026-08-10", amount: 39.22 });
    const heredia = elad({ id: "121", reference: "TB-2026-0121", title: "Heredia", startDate: "2026-08-10", endDate: "2026-08-11" });
    const bettane = {
      id: "066",
      reference: "TB-2026-0066",
      title: "Santa Teresa",
      destination: "Santa Teresa",
      customerId: "bettane",
      clientName: "Benjamin Bettane",
      clientFirst: "Benjamin",
      clientLast: "Bettane",
      startDate: "2026-08-02",
      endDate: "2026-08-06",
      createdAt: "2026-10-09",
      items: [
        { id: "nantipa", kind: "hotel", title: "Nantipa", amount: 234.53, startAt: "2026-08-02", details: { hotel_name: "Nantipa", document_amount: 234.53, document_currency: "EUR" } },
      ],
    };
    const deauville = {
      id: "089",
      reference: "TB-2026-0089",
      title: "Deauville",
      destination: "Deauville",
      customerId: "boukris",
      clientName: "Benjamin Elie David Boukris",
      clientFirst: "Benjamin Elie David",
      clientLast: "Boukris",
      startDate: "2026-10-30",
      endDate: "2026-11-01",
      createdAt: "2026-10-18",
      items: [
        {
          id: "you",
          kind: "hotel",
          title: "You Hotel Deauville",
          supplier: "RateHawk",
          amount: 460,
          startAt: "2026-10-30",
          endAt: "2026-11-01",
          details: { hotel_name: "You Hotel Deauville - Handwritten Collection" },
        },
      ],
    };
    const bookings = [bettane, deauville, bajos, cabo, heredia];
    const card = { cardName: "Elad Taieb" };

    assert.equal(suggestCostTargets({ party: "NANTIPA", amount: 1839.4, date: "2026-08-07" }, bookings)[0]?.bookingId, "066");

    const nantipa = suggestCostTargets({ party: "NANTIPA", amount: 1839.4, date: "2026-08-07", ...card }, bookings);
    assert.equal(nantipa[0]?.bookingId, "120");
    assert.equal(nantipa[0]?.confidence, "moyenne");
    assert.match(costSuggestionSummary(nantipa[0]!), /carte au nom du client/i);
    assert.match(costSuggestionSummary(nantipa[0]!), /même client \/ même carte/i);

    const early = suggestCostTargets({ party: "NANTIPA", amount: 7566.96, date: "2026-07-20", ...card }, bookings);
    assert.equal(early[0]?.bookingId, "119");
    assert.equal(early[0]?.confidence, "basse");
    assert.equal(early.some((hit) => hit.bookingId === "066"), false);

    const ratehawk = suggestCostTargets({ party: "ratehawk.com", amount: 3497, date: "2026-07-13", ...card }, bookings);
    assert.equal(ratehawk[0]?.bookingId, "119");
    assert.equal(ratehawk[0]?.confidence, "basse");
    assert.equal(ratehawk.some((hit) => hit.bookingId === "089"), false);

    const refund = suggestCostTargets({ party: "PAYPAL *TOURPLANMAY", amount: 234.53, date: "2026-08-21", ...card }, bookings);
    assert.equal(refund[0]?.bookingId, "121");
    assert.equal(refund[0]?.confidence, "moyenne");
    assert.match(costSuggestionSummary(refund[0]!), /même client \/ même carte/i);
    assert.equal(refund.some((hit) => hit.bookingId === "066"), false);

    const priced = suggestCostTargets({ party: "CTT", amount: 39.22, date: "2026-08-08", ...card }, bookings);
    assert.equal(priced[0]?.bookingId, "120");
    assert.equal(priced[0]?.confidence, "haute");

    for (const cardName of ["Amadeus", "Hotel", "TB-2026-0066", "Club Med"]) {
      assert.equal(suggestCostTargets({ party: "CTT", amount: 12.34, date: "2026-08-06", cardName }, [bajos, cabo, heredia]).length, 0, cardName);
    }
  });

  it("parmi les dossiers d’Elad, la confirmation et le fournisseur passent avant la date", () => {
    const face = (partial: { id: string; reference: string; title: string; destination: string; startDate?: string | null; endDate?: string | null }) => ({
      customerId: "elad",
      clientName: "Elad Taieb",
      clientFirst: "Elad",
      clientLast: "Taieb",
      createdAt: "2026-11-09",
      items: [] as { id: string; kind: string; title: string; supplier?: string; amount: number | null; confirmationRef?: string; startAt?: string; endAt?: string; details?: Record<string, unknown> }[],
      ...partial,
    });
    const bajos = face({ id: "119", reference: "TB-2026-0119", title: "Bajos del Toro", destination: "Bajos del Toro", startDate: "2026-07-28", endDate: "2026-07-30" });
    bajos.items.push({
      id: "sjo-out",
      kind: "transfer",
      title: "Transfert aéroport SJO",
      supplier: "Expedia TAAP",
      amount: 0,
      confirmationRef: "73499370819632",
      startAt: "2026-07-28",
      details: { aeroport: "SJO", ville: "San José" },
    });
    const cabo = face({ id: "120", reference: "TB-2026-0120", title: "Cabo Velas", destination: "Cabo Velas", startDate: "2026-08-07", endDate: "2026-08-10" });
    const heredia = face({ id: "121", reference: "TB-2026-0121", title: "Heredia", destination: "Heredia", startDate: "2026-08-10", endDate: "2026-08-11" });
    const arenas = face({ id: "161", reference: "TB-2026-0161", title: "Manuel Antonio – Arenas del Mar", destination: "Manuel Antonio" });
    arenas.items.push({
      id: "arenas",
      kind: "hotel",
      title: "Arenas del Mar Beachfront",
      supplier: "Expedia TAAP",
      amount: 0,
      confirmationRef: "73497926989438",
      details: { hotel_name: "Arenas del Mar Beachfront", country: "Costa Rica", supplier_net: 2612.03, supplier_currency: "USD" },
    });
    const nantipa = face({ id: "162", reference: "TB-2026-0162", title: "Santa Teresa – Nantipa", destination: "Santa Teresa" });
    nantipa.items.push({
      id: "nantipa",
      kind: "hotel",
      title: "Nantipa",
      supplier: "Nantipa",
      amount: 0,
      details: { hotel_name: "Nantipa", country: "Costa Rica", supplier_net: 8644.5, supplier_currency: "USD" },
    });
    const miami = face({ id: "163", reference: "TB-2026-0163", title: "Miami Beach", destination: "Miami", startDate: "2026-07-23", endDate: "2026-07-28" });
    miami.items.push({
      id: "w",
      kind: "hotel",
      title: "W South Beach",
      supplier: "RateHawk",
      amount: 0,
      startAt: "2026-07-23",
      endAt: "2026-07-28",
      details: { hotel_name: "W South Beach", city: "Miami Beach", supplier_net: 3497, supplier_currency: "EUR" },
    });
    const bookings = [miami, bajos, cabo, heredia, arenas, nantipa];
    const card = { cardName: "Elad Taieb" };

    const arenasPay = suggestCostTargets({ party: "EG*TRVL73497926989438", amount: 5499.6, date: "2026-07-17", ...card }, bookings);
    assert.equal(arenasPay[0]?.bookingId, "161");
    assert.equal(arenasPay[0]?.itemId, "arenas");
    assert.equal(arenasPay[0]?.confidence, "haute");
    assert.equal(arenasPay[0]?.reasons.includes("itinerary"), true);
    assert.equal(dossierMatchLabel({ reference: "TB-2026-0161", title: arenas.title, clientName: arenas.clientName }), "TB-2026-0161 · Manuel Antonio – Arenas del Mar · Elad Taieb");
    const tail = suggestCostTargets({ party: "EG*TRVL89438", amount: 5499.6, date: "2026-07-17", ...card }, bookings);
    assert.equal(tail[0]?.bookingId, "161");

    const hotel = suggestCostTargets(
      { party: "NANTIPA", amount: 1839.4, originalAmount: 2117.88, originalCurrency: "USD", date: "2026-08-07", ...card },
      bookings
    );
    assert.equal(hotel[0]?.bookingId, "162");
    assert.equal(hotel[0]?.confidence, "haute");
    assert.equal(hotel[0]?.reasons.includes("hotel"), true);
    const refund = suggestCostTargets(
      { party: "NANTIPA", amount: 172.85, originalAmount: 200, originalCurrency: "USD", date: "2026-08-14", ...card },
      bookings
    );
    assert.equal(refund[0]?.bookingId, "162");
    assert.equal(refund.some((hit) => hit.bookingId === "120" || hit.bookingId === "121"), false);

    const transfer = suggestCostTargets({ party: "EG*TRVL73499370819632", amount: 183.24, date: "2026-07-19", ...card }, bookings);
    assert.equal(transfer[0]?.bookingId, "119");
    assert.equal(transfer[0]?.itemId, "sjo-out");
    const sjo = suggestCostTargets({ party: "TAXI SJO", amount: 45, date: "2026-07-19", ...card }, bookings);
    assert.notEqual(sjo[0]?.bookingId, "163");
    assert.equal(["119", "120", "121", "161", "162"].includes(sjo[0]?.bookingId || ""), true);

    const avianca = suggestCostTargets({ party: "AVIANCA", amount: 365.93, date: "2026-07-20", ...card }, bookings);
    assert.notEqual(avianca[0]?.bookingId, "163");
    assert.equal(avianca[0]?.bookingId, "119");
    assert.match(costSuggestionSummary(avianca[0]!), /même client \/ même carte/i);
  });

  it("relie EG*TRVL au dossier même sur la carte agence, y compris si le débit est inférieur au coût net", () => {
    const ranch = {
      id: "ranch",
      reference: "TB-2026-0044",
      title: "Paris · Marrakech · Aghouatim",
      destination: "Marrakech",
      customerId: "samak",
      clientName: "Jérémy Samak",
      clientFirst: "Jérémy",
      clientLast: "Samak",
      items: [
        {
          id: "ranch-hotel",
          kind: "hotel",
          title: "The Ranch resort",
          supplier: "Expedia TAAP",
          amount: 400,
          confirmationRef: "73540142114230",
          details: {
            hotel_name: "The Ranch resort",
            supplier_net: 400,
            supplier_currency: "EUR",
            notes: "Coût total 400 € : part Expedia TAAP 271,66 € + reste payé à l’hôtel.",
          },
        },
      ],
    };
    const decoy = {
      id: "decoy",
      reference: "TB-2026-0099",
      title: "Rome",
      customerId: "ada",
      clientName: "Ada Martin",
      items: [{ id: "rome", kind: "hotel", title: "Hôtel de Rome", amount: 271.66, details: { hotel_name: "Hôtel de Rome" } }],
    };
    const card = { cardName: "AMADEUS" };
    const hits = suggestCostTargets({ party: "EG*TRVL73540142114230", amount: 271.66, date: "2026-10-01", ...card }, [decoy, ranch]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.bookingId, "ranch");
    assert.equal(hits[0]?.itemId, "ranch-hotel");
    assert.equal(hits[0]?.confidence, "haute");
    assert.equal(hits[0]?.reasons.includes("itinerary"), true);
    assert.equal(
      dossierMatchLabel({ reference: ranch.reference, title: ranch.title, clientName: ranch.clientName }),
      "TB-2026-0044 · Paris · Marrakech · Aghouatim · Jérémy Samak"
    );
    const bare = suggestCostTargets({ party: "73540142114230", amount: 271.66, cardName: "AMADEUS" }, [decoy, ranch]);
    assert.equal(bare[0]?.bookingId, "ranch");

    const portion = suggestCostTargets({ party: "EG*TRVL73540142114230", amount: 271.66, cardName: "" }, [ranch]);
    assert.equal(portion[0]?.confidence, "haute");
    assert.ok((portion[0]?.score || 0) >= 90);
    const share = suggestCostTargets({ party: "EXPEDIA TAAP", amount: 271.66 }, [ranch]);
    assert.equal(share[0]?.bookingId, "ranch");
    assert.equal(share[0]?.reasons.includes("amount"), true);

    const copies = markDuplicateOutgoing(
      [0, 1, 2, 3].map((index) => ({
        id: `eg-${index}`,
        party: "EG*TRVL73540142114230",
        amount: 271.66,
        currency: "EUR",
        suggestions: hits,
      }))
    );
    assert.equal(copies[0]?.suggestions[0]?.confidence, "haute");
    assert.equal(copies[0]?.suggestions[0]?.reasons.includes("duplicate"), false);
    for (const line of copies.slice(1)) {
      assert.equal(line.suggestions[0]?.bookingId, "ranch");
      assert.equal(line.suggestions[0]?.confidence, "basse");
      assert.match(costSuggestionSummary(line.suggestions[0]!), /doublon possible/i);
    }
  });
});

function roundSale(lines: { sale: number; cost: number }[]) {
  return Math.round(lines.reduce((sum, line) => sum + line.sale - line.cost, 0) * 100) / 100;
}
