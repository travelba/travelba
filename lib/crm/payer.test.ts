import assert from "node:assert/strict";
import test from "node:test";
import {
  anchorBillingCompanyId,
  assignPayer,
  collectableStayAmount,
  defaultPayer,
  encoursPartLabel,
  fitPayerOwed,
  owedByPayer,
  payerBadge,
  paymentSlips,
  resolveFeesFollowStay,
  slipMention,
} from "./payer";
import { stayPriceWithExpenses } from "./ledger-display";
import { excludedStripeTypes, stayPayMethods, stripeCreditFromIntent } from "./stripe-pay";

const companies = [
  { id: "b", sort_order: 2, company_name: "Beta" },
  { id: "a", sort_order: 0, company_name: "Alpha" },
];

test("la première société du compte est le défaut", () => {
  assert.deepEqual(defaultPayer(companies), { payer_kind: "company", billing_company_id: "a" });
  assert.deepEqual(defaultPayer([]), { payer_kind: "personal", billing_company_id: null });
});

test("une société inconnue retombe sur la même société par défaut", () => {
  assert.deepEqual(assignPayer({ payerKind: "company", companyId: "nope", companies }), {
    payer_kind: "company",
    billing_company_id: "a",
  });
  assert.deepEqual(assignPayer({ payerKind: "company", companyId: "b", companies }), {
    payer_kind: "company",
    billing_company_id: "b",
  });
  assert.equal("error" in assignPayer({ payerKind: "company", companies: [] }), true);
});

test("le particulier n’emporte pas de société", () => {
  assert.deepEqual(assignPayer({ payerKind: "personal", companyId: "a", companies }), {
    payer_kind: "personal",
    billing_company_id: null,
  });
  assert.equal(payerBadge("company", "Alpha"), "Société · Alpha");
  assert.equal(payerBadge("personal", "Alpha"), "Particulier");
  assert.equal(payerBadge(null, "Alpha"), null);
});

test("le montant à régler laisse le séjour hors agence et garde la commission", () => {
  assert.equal(
    collectableStayAmount({
      stayTotal: 1000,
      agencyCommission: true,
      clientSettlesStay: false,
      pricesVisible: true,
      expenses: [{ amount: 40 }],
    }),
    1144
  );
  assert.equal(
    collectableStayAmount({
      stayTotal: 1000,
      agencyCommission: true,
      clientSettlesStay: true,
      pricesVisible: true,
      expenses: [{ amount: 40 }],
    }),
    144
  );
  assert.equal(
    collectableStayAmount({
      stayTotal: 1000,
      agencyCommission: false,
      clientSettlesStay: false,
      pricesVisible: false,
      expenses: [],
    }),
    null
  );
});

test("une même facture tient en une carte, une autre facture en deux", () => {
  const shared = {
    stayTotal: 1000,
    agencyCommission: true,
    clientSettlesStay: false,
    pricesVisible: true,
    expenses: [{ amount: 40 }],
    stayKind: "company" as const,
    stayCompanyId: "a",
    otherCompanyId: "a",
  };
  const one = paymentSlips({ ...shared, feesFollowStay: true });
  assert.equal(one.length, 1);
  assert.equal(one[0]?.slice, "stay");
  assert.equal(one[0]?.amount, 1144);
  assert.equal(one[0]?.kind, "company");

  const two = paymentSlips({ ...shared, feesFollowStay: false });
  assert.deepEqual(
    two.map((slip) => [slip.slice, slip.kind, slip.amount, slip.payable]),
    [
      ["stay", "company", 1000, true],
      ["fees", "personal", 144, true],
    ]
  );
  assert.equal(slipMention("personal", "Horizon"), "Sans facture société");
  assert.equal(slipMention("company", "Horizon SAS"), "Facture Horizon SAS");
});

test("les frais de billeterie s’encaissent même sans prix de séjour", () => {
  const slips = paymentSlips({
    stayTotal: 0,
    agencyCommission: false,
    clientSettlesStay: false,
    pricesVisible: true,
    expenses: [],
    ticketingFee: 25,
    stayKind: "personal",
    stayCompanyId: null,
    feesFollowStay: true,
    otherCompanyId: null,
  });
  assert.equal(slips.length, 1);
  assert.equal(slips[0]?.slice, "stay");
  assert.equal(slips[0]?.kind, "personal");
  assert.equal(slips[0]?.amount, 25);
  assert.equal(slips[0]?.payable, true);
  assert.equal(
    slips[0]?.amount,
    stayPriceWithExpenses({
      stayTotal: 0,
      agencyCommission: false,
      expenses: [],
      ticketingFee: 25,
    })
  );
});

test("l’hôtel hors agence ne s’encaisse pas, les frais si", () => {
  const slips = paymentSlips({
    stayTotal: 1000,
    agencyCommission: true,
    clientSettlesStay: true,
    pricesVisible: true,
    expenses: [{ amount: 40 }],
    stayKind: "personal",
    stayCompanyId: null,
    feesFollowStay: false,
    otherCompanyId: "a",
  });
  assert.equal(slips[0]?.hotelAside, true);
  assert.equal(slips[0]?.payable, false);
  assert.equal(slips[1]?.slice, "fees");
  assert.equal(slips[1]?.kind, "company");
  assert.equal(slips[1]?.companyId, "a");
  assert.equal(slips[1]?.amount, 144);
  assert.equal(resolveFeesFollowStay({ stayKind: "personal", requested: false, companyCount: 0 }), true);
});

test("les moyens suivent le payeur et la devise", () => {
  assert.deepEqual(stayPayMethods("company", "EUR"), ["card", "apple_pay", "sepa_debit", "revolut"]);
  assert.deepEqual(stayPayMethods("company", "USD"), ["card", "apple_pay"]);
  assert.deepEqual(stayPayMethods("personal", "EUR"), ["card", "apple_pay", "revolut"]);
  assert.deepEqual(stayPayMethods("personal", "CHF"), ["card", "apple_pay"]);
  assert.equal(excludedStripeTypes("sepa_debit").includes("sepa_debit"), false);
  assert.equal(excludedStripeTypes("sepa_debit").includes("card"), true);
  assert.equal(excludedStripeTypes("apple_pay").includes("card"), false);
});

test("un paiement abouti devient un crédit, un virement en attente non", () => {
  assert.equal(stripeCreditFromIntent({ id: "pi_1", status: "processing", amount: 1000, metadata: {} }), null);
  const credit = stripeCreditFromIntent({
    id: "pi_1",
    status: "succeeded",
    amount: 114050,
    currency: "eur",
    metadata: {
      crm_customer_id: "c1",
      crm_booking_id: "b1",
      billing_company_id: "a",
      pay_method: "sepa_debit",
      reference: "TB-1",
    },
  });
  assert.equal(credit?.amount, 1140.5);
  assert.equal(credit?.kind, "transfer");
  assert.equal(credit?.source, "stripe");
  assert.equal(credit?.external_id, "pi_1");
  assert.equal(credit?.billing_company_id, "a");
  assert.match(credit?.label || "", /Prélèvement SEPA/);
  assert.match(
    stripeCreditFromIntent({
      id: "pi_4",
      status: "succeeded",
      amount: 14000,
      currency: "eur",
      metadata: {
        crm_customer_id: "c1",
        crm_booking_id: "b1",
        pay_method: "card",
        pay_mention: "Sans facture société",
        reference: "TB-1",
      },
    })?.label || "",
    /Sans facture société/
  );

  const card = stripeCreditFromIntent({
    id: "pi_2",
    status: "succeeded",
    amount: 500,
    currency: "eur",
    metadata: {
      crm_customer_id: "c1",
      crm_booking_id: "b1",
      pay_method: "card",
      reference: "TB-1",
    },
  });
  assert.equal(card?.kind, "card_payment");
  assert.equal(card?.billing_company_id, null);
  assert.equal(card?.payer_kind, "personal");
  assert.equal(
    stripeCreditFromIntent({
      id: "pi_3",
      status: "succeeded",
      amount: 2500,
      currency: "eur",
      metadata: {
        crm_customer_id: "c1",
        crm_booking_id: "b1",
        pay_method: "revolut",
        reference: "TB-1",
      },
    }),
    null
  );
});

test("l’encours dû se répartit entre société et particulier", () => {
  const payers = new Map<string, "company" | "personal" | null>([
    ["b1", "company"],
    ["b2", "personal"],
  ]);
  const split = owedByPayer(
    [
      { direction: "debit", amount: 1000, booking_id: "b1", status: "posted", currency: "EUR" },
      { direction: "debit", amount: 400, booking_id: "b2", status: "posted", currency: "EUR" },
      { direction: "credit", amount: 200, status: "posted", currency: "EUR" },
    ],
    payers,
    "EUR"
  );
  const owed = fitPayerOwed(split.company, split.personal, 1200);
  assert.equal(owed.total, 1200);
  assert.equal(Math.round((owed.company + owed.personal) * 100) / 100, 1200);
  assert.equal(owed.company > owed.personal, true);
  assert.equal(encoursPartLabel("company", "Horizon"), "Société · Horizon");
  assert.equal(encoursPartLabel("personal", "Horizon"), "Particulier");
  assert.equal(
    anchorBillingCompanyId([
      { direction: "debit", amount: 80, billing_company_id: "a", status: "posted", currency: "EUR" },
      { direction: "debit", amount: 20, billing_company_id: "b", status: "posted", currency: "EUR" },
    ]),
    "a"
  );
});

test("un règlement d’encours sans dossier devient un crédit de la bonne part", () => {
  const credit = stripeCreditFromIntent({
    id: "pi_ledger",
    status: "succeeded",
    amount: 80000,
    currency: "eur",
    metadata: {
      crm_customer_id: "c1",
      payer_kind: "personal",
      pay_method: "card",
      pay_mention: "Particulier",
    },
  });
  assert.equal(credit?.booking_id, null);
  assert.equal(credit?.payer_kind, "personal");
  assert.equal(credit?.kind, "card_payment");
  assert.match(credit?.label || "", /Particulier/);
});
