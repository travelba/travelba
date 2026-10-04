import assert from "node:assert/strict";
import test from "node:test";
import {
  STAY_PAY_LABELS,
  excludedStripeTypes,
  stayPayMethodOf,
  stayPayMethods,
  stripeCreditFromIntent,
  stripeCreditKind,
  stripeCreditLabel,
  stripeTypeForMethod,
} from "./stripe-pay";

test("particulier : carte, Apple Pay, virement en euros ; carte et Apple Pay seulement en devise", () => {
  assert.deepEqual(stayPayMethods("personal", "EUR"), ["card", "apple_pay", "revolut"]);
  assert.deepEqual(stayPayMethods("personal", "eur"), ["card", "apple_pay", "revolut"]);
  assert.deepEqual(stayPayMethods("personal", "USD"), ["card", "apple_pay"]);
  assert.deepEqual(stayPayMethods("personal", "CHF"), ["card", "apple_pay"]);
});

test("société : prélèvement SEPA et virement en euros, rien en devise", () => {
  assert.deepEqual(stayPayMethods("company", "EUR"), ["sepa_debit", "revolut"]);
  assert.deepEqual(stayPayMethods("company", "USD"), []);
  assert.equal(stayPayMethods("company", "EUR").includes("card"), false);
  assert.equal(stayPayMethods("personal", "EUR").includes("sepa_debit"), false);
});

test("Apple Pay est un portefeuille de la carte Stripe ; le SEPA garde son type", () => {
  assert.equal(stripeTypeForMethod("apple_pay"), "card");
  assert.equal(stripeTypeForMethod("card"), "card");
  assert.equal(stripeTypeForMethod("sepa_debit"), "sepa_debit");
  assert.equal(stripeCreditKind("card"), "card_payment");
  assert.equal(stripeCreditKind("apple_pay"), "card_payment");
  assert.equal(stripeCreditKind("sepa_debit"), "transfer");
});

test("les types Stripe exclus ne laissent passer que le moyen choisi", () => {
  const card = excludedStripeTypes("card");
  assert.equal(card.includes("card"), false);
  assert.equal(card.includes("sepa_debit"), true);
  assert.equal(card.includes("paypal"), true);
  const apple = excludedStripeTypes("apple_pay");
  assert.equal(apple.includes("card"), false);
  const sepa = excludedStripeTypes("sepa_debit");
  assert.equal(sepa.includes("sepa_debit"), false);
  assert.equal(sepa.includes("card"), true);
  const revolut = excludedStripeTypes("revolut");
  assert.equal(revolut.includes("card"), true);
  assert.equal(revolut.includes("sepa_debit"), true);
});

test("stayPayMethodOf ne reconnaît que les quatre moyens", () => {
  assert.equal(stayPayMethodOf("card"), "card");
  assert.equal(stayPayMethodOf("sepa_debit"), "sepa_debit");
  assert.equal(stayPayMethodOf("paypal"), null);
  assert.equal(stayPayMethodOf(""), null);
  assert.equal(stayPayMethodOf(42), null);
  assert.equal(stayPayMethodOf(undefined), null);
});

test("le libellé du crédit porte la référence, la mention et le moyen", () => {
  assert.equal(stripeCreditLabel("card", "TBA-2026-0042"), "Règlement TBA-2026-0042 · Carte bancaire");
  assert.equal(stripeCreditLabel("sepa_debit", "TBA-2026-0042", " Facture Maison Dupont "), "Règlement TBA-2026-0042 · Facture Maison Dupont · Prélèvement SEPA");
  assert.equal(stripeCreditLabel("revolut", "TBA-1", ""), `Règlement TBA-1 · ${STAY_PAY_LABELS.revolut}`);
});

test("un PaymentIntent abouti devient un crédit posté, en euros, sur le bon payeur", () => {
  const credit = stripeCreditFromIntent({
    id: "pi_test_1",
    status: "succeeded",
    amount: 123456,
    currency: "eur",
    metadata: {
      crm_customer_id: "cust-1",
      crm_booking_id: "book-1",
      reference: "TBA-2026-0042",
      pay_method: "apple_pay",
      payer_kind: "personal",
    },
  });
  assert.ok(credit);
  assert.equal(credit.customer_id, "cust-1");
  assert.equal(credit.booking_id, "book-1");
  assert.equal(credit.billing_company_id, null);
  assert.equal(credit.payer_kind, "personal");
  assert.equal(credit.direction, "credit");
  assert.equal(credit.kind, "card_payment");
  assert.equal(credit.amount, 1234.56);
  assert.equal(credit.currency, "EUR");
  assert.equal(credit.label, "Règlement TBA-2026-0042 · Apple Pay");
  assert.equal(credit.source, "stripe");
  assert.equal(credit.external_id, "pi_test_1");
  assert.equal(credit.status, "posted");
});

test("le payeur se déduit de la société de facturation ou du dossier quand la métadonnée manque", () => {
  const company = stripeCreditFromIntent({
    id: "pi_2",
    status: "succeeded",
    amount: 50000,
    currency: "eur",
    metadata: { crm_customer_id: "cust-1", billing_company_id: "comp-1", pay_method: "sepa_debit", pay_mention: "Facture Maison Dupont" },
  });
  assert.equal(company?.payer_kind, "company");
  assert.equal(company?.billing_company_id, "comp-1");
  assert.equal(company?.booking_id, null);
  assert.equal(company?.kind, "transfer");
  assert.equal(company?.label, "Règlement Facture Maison Dupont · Prélèvement SEPA");

  const personal = stripeCreditFromIntent({
    id: "pi_3",
    status: "succeeded",
    amount: 2500,
    currency: "eur",
    metadata: { crm_customer_id: "cust-1", crm_booking_id: "book-9", pay_method: "card" },
  });
  assert.equal(personal?.payer_kind, "personal");
  assert.equal(personal?.label, "Règlement book-9 · Carte bancaire");

  const encours = stripeCreditFromIntent({
    id: "pi_4",
    status: "succeeded",
    amount: 2500,
    currency: "eur",
    metadata: { crm_customer_id: "cust-1", pay_method: "card", payer_kind: "personal" },
  });
  assert.equal(encours?.label, "Règlement particulier · Carte bancaire");
});

test("rien n’est crédité avant succès, sans client, sans payeur, pour un virement ou un montant nul", () => {
  const base = {
    id: "pi_5",
    status: "succeeded",
    amount: 1000,
    currency: "eur",
    metadata: { crm_customer_id: "cust-1", crm_booking_id: "book-1", pay_method: "card", payer_kind: "personal" },
  };
  assert.equal(stripeCreditFromIntent({ ...base, status: "processing" }), null);
  assert.equal(stripeCreditFromIntent({ ...base, status: "requires_payment_method" }), null);
  assert.equal(stripeCreditFromIntent({ ...base, id: undefined }), null);
  assert.equal(stripeCreditFromIntent({ ...base, metadata: { ...base.metadata, crm_customer_id: "" } }), null);
  assert.equal(stripeCreditFromIntent({ ...base, metadata: { crm_customer_id: "cust-1", pay_method: "card" } }), null);
  assert.equal(stripeCreditFromIntent({ ...base, metadata: { ...base.metadata, pay_method: "revolut" } }), null);
  assert.equal(stripeCreditFromIntent({ ...base, metadata: { ...base.metadata, pay_method: "paypal" } }), null);
  assert.equal(stripeCreditFromIntent({ ...base, amount: 0 }), null);
  assert.equal(stripeCreditFromIntent({ ...base, amount: Number.NaN }), null);
  assert.equal(stripeCreditFromIntent({ ...base, metadata: null }), null);
});
