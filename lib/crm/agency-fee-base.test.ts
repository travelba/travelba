import assert from "node:assert/strict";
import test from "node:test";
import { agencyCommissionAmount, agencyFeeBaseFromItems } from "./bookings";
import { displayedStayAmount } from "./displayed-stay";
import { validatedExpenseDetails } from "./expense-validation";
import { clientStayExpenseLines, stayPriceWithExpenses } from "./ledger-display";
import { dossierStayAmount } from "./mb3m-invoice";
import { agencyFeeBaseAmount, agencyFeeFromGross, formatMoney } from "./money";
import { paymentSlips } from "./payer";
import { AGENCY_FEE_LABEL } from "./types";

/**
 * TB-2026-0170 : hôtel 2 996,23 + vol 3 972,14 + frais de billeterie 50 = 7 018,37.
 * Le retour n’a pas de prix. La dépense fournisseur encore « à valider » n’est pas vendue.
 */
const items0170 = [
  { kind: "hotel", amount: 2996.23, lifecycle: "active", include_in_ledger: true },
  {
    kind: "flight",
    amount: 3972.14,
    lifecycle: "active",
    include_in_ledger: true,
    start_at: "2026-06-01T10:00:00",
    details: { from: "CDG", to: "TLV" },
  },
  {
    kind: "flight",
    amount: null,
    lifecycle: "active",
    include_in_ledger: false,
    start_at: "2026-06-08T18:00:00",
    details: { from: "TLV", to: "CDG" },
  },
  {
    kind: "expense",
    amount: 50,
    lifecycle: "active",
    include_in_ledger: true,
    details: { auto_fee: "ticketing" },
  },
  {
    kind: "expense",
    amount: 2996.23,
    lifecycle: "active",
    include_in_ledger: true,
    details: { awaiting_validation: true },
  },
];

const stayTotal = 6968.37;
const sold = 7018.37;

test("TB-2026-0170 : la commission 10 % inclut les frais de billeterie, pas la dépense à valider", () => {
  const base = agencyFeeBaseFromItems(items0170);
  assert.equal(base, sold);
  assert.equal(agencyFeeFromGross(base, 0.1), 701.84);
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "confirmed", base, rate: 0.1, visibleToClient: true }),
    701.84
  );
  // La commission ne rentre pas dans sa propre assiette.
  assert.equal(agencyFeeFromGross(base + 701.84, 0.1), 772.02);
  assert.notEqual(agencyFeeFromGross(base, 0.1), agencyFeeFromGross(base + 701.84, 0.1));
});

test("le même dossier à 7,5 %", () => {
  const base = agencyFeeBaseFromItems(items0170);
  assert.equal(agencyFeeFromGross(base, 0.075), 526.38);
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "confirmed", base, rate: 0.075 }),
    526.38
  );
});

test("le prix, le règlement et la ligne client utilisent la même assiette", () => {
  const expenses = [{ amount: 50 }];
  const fromItems = agencyFeeBaseFromItems(items0170);
  const fromAmounts = agencyFeeBaseAmount({ stayTotal, expenses });
  const beforeTheLineExists = agencyFeeBaseAmount({ stayTotal, expenses: [], ticketingFee: 50 });
  assert.equal(fromItems, fromAmounts);
  assert.equal(beforeTheLineExists, fromAmounts);

  const price = stayPriceWithExpenses({
    stayTotal,
    agencyCommission: true,
    expenses,
    agencyFeeRate: 0.1,
  });
  assert.equal(price, 7720.21);

  const slips = paymentSlips({
    stayTotal,
    agencyCommission: true,
    clientSettlesStay: false,
    pricesVisible: true,
    expenses,
    agencyFeeRate: 0.1,
    stayKind: "personal",
    stayCompanyId: null,
    feesFollowStay: true,
    otherCompanyId: null,
  });
  assert.equal(slips[0]?.amount, price);

  const lines = clientStayExpenseLines({
    expenses: [{ id: "fee", title: "Frais de billeterie (2 billets)", amount: 50 }],
    agencyCommission: true,
    stayTotal,
    currency: "EUR",
    pricesVisible: true,
    agencyFeeRate: 0.1,
  });
  assert.equal(lines[0]?.title, AGENCY_FEE_LABEL);
  assert.equal(lines[0]?.amountLabel, formatMoney(701.84, "EUR"));

  const shown = displayedStayAmount(
    {
      status: "confirmed",
      total_amount: stayTotal,
      agency_commission: true,
      fee_mode: null,
    },
    items0170,
    2,
    0.1
  );
  assert.equal(shown, price);
});

test("toutes les dépenses vendues entrent, au montant de la ligne, pas au prix unitaire", () => {
  const awaiting = {
    kind: "expense",
    amount: 200,
    lifecycle: "active" as const,
    title: "Restaurant à valider",
    details: { pliant_transaction_id: "tx-wait", awaiting_validation: true, quantity: 1, unit_price: 200 },
  };
  const items = [
    { kind: "hotel", amount: 1000, lifecycle: "active" as const },
    {
      kind: "expense",
      amount: 50,
      lifecycle: "active" as const,
      title: "Frais de billeterie (2 billets)",
      details: { auto_fee: "ticketing" },
    },
    { kind: "expense", amount: 40, lifecycle: "active" as const, title: "Pourboire", details: {} },
    {
      kind: "expense",
      amount: 30,
      lifecycle: "active" as const,
      title: "Frais billetterie train",
      details: { quantity: 3, unit_price: 10 },
    },
    {
      kind: "expense",
      amount: 50,
      lifecycle: "active" as const,
      title: "Transferts",
      details: { quantity: 4, unit_price: 12.5 },
    },
    {
      kind: "expense",
      amount: 80,
      lifecycle: "active" as const,
      title: "Restaurant",
      details: { pliant_transaction_id: "tx-ok", quantity: 1, unit_price: 80 },
    },
    {
      kind: "expense",
      amount: 15,
      lifecycle: "active" as const,
      title: "Conciergerie",
      details: { expense_type: "futur" },
    },
    awaiting,
    { kind: "expense", amount: 99, lifecycle: "cancelled" as const, title: "Annulée", details: {} },
  ];
  // 1 000 + 50 + 40 + 30 + 50 + 80 + 15. Les unitaires 10 et 12,50 ne remplacent pas le montant.
  const soldLines = 1265;
  assert.equal(agencyFeeBaseFromItems(items), soldLines);
  assert.equal(agencyFeeFromGross(soldLines, 0.1), 126.5);
  assert.notEqual(agencyFeeBaseFromItems(items), soldLines - 20 - 37.5);

  const validated = { ...awaiting, details: validatedExpenseDetails(awaiting.details) };
  const after = items.map((item) => (item === awaiting ? validated : item));
  assert.equal(agencyFeeBaseFromItems(after), soldLines + 200);

  const expenses = [50, 40, 30, 50, 80, 15].map((amount) => ({ amount }));
  assert.equal(agencyFeeBaseAmount({ stayTotal: 1000, expenses }), soldLines);
  const price = stayPriceWithExpenses({
    stayTotal: 1000,
    agencyCommission: true,
    expenses,
    agencyFeeRate: 0.1,
  });
  assert.equal(price, 1391.5);
  const slips = paymentSlips({
    stayTotal: 1000,
    agencyCommission: true,
    clientSettlesStay: false,
    pricesVisible: true,
    expenses,
    agencyFeeRate: 0.1,
    stayKind: "personal",
    stayCompanyId: null,
    feesFollowStay: true,
    otherCompanyId: null,
  });
  assert.equal(slips[0]?.amount, price);
  const lines = clientStayExpenseLines({
    expenses: [
      { id: "ticketing", title: "Frais de billeterie (2 billets)", amount: 50 },
      { id: "tip", title: "Pourboire", amount: 40 },
      { id: "train", title: "Frais billetterie train", amount: 30 },
      { id: "transfer", title: "Transferts", amount: 50 },
      { id: "pliant", title: "Restaurant", amount: 80 },
      { id: "future", title: "Conciergerie", amount: 15 },
    ],
    agencyCommission: true,
    stayTotal: 1000,
    currency: "EUR",
    pricesVisible: true,
    agencyFeeRate: 0.1,
  });
  assert.equal(lines[0]?.title, AGENCY_FEE_LABEL);
  assert.equal(lines[0]?.amountLabel, formatMoney(126.5, "EUR"));
  assert.equal(lines.filter((line) => line.id !== "agency-commission").length, 6);

  const shown = displayedStayAmount(
    { status: "confirmed", total_amount: 1000, agency_commission: true, fee_mode: null },
    items,
    2,
    0.1
  );
  assert.equal(shown, price);
  assert.equal(
    dossierStayAmount({ items, agencyCommission: true, status: "confirmed", travelerCount: 2, agencyFeeRate: 0.1 }),
    price
  );
});

test("une carte au prix vendu reste dans l’assiette même si elle n’est pas au livre", () => {
  const unchecked = [
    { kind: "hotel", amount: 1000, include_in_ledger: false },
    { kind: "expense", amount: 25, details: { auto_fee: "ticketing" } },
  ];
  assert.equal(agencyFeeBaseFromItems(unchecked), 1025);
});
