import assert from "node:assert/strict";
import test from "node:test";
import { assignPayer, collectableStayAmount, defaultPayer, payerBadge } from "./payer";
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
    1140
  );
  assert.equal(
    collectableStayAmount({
      stayTotal: 1000,
      agencyCommission: true,
      clientSettlesStay: true,
      pricesVisible: true,
      expenses: [{ amount: 40 }],
    }),
    140
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

test("les moyens suivent le payeur et la devise", () => {
  assert.deepEqual(stayPayMethods("company", "EUR"), ["sepa_debit", "revolut"]);
  assert.deepEqual(stayPayMethods("company", "USD"), []);
  assert.deepEqual(stayPayMethods("personal", "EUR"), ["card", "apple_pay", "sepa_debit", "revolut"]);
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
