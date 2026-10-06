import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldIngestStripeForRapprochement,
  stripeInboxCopy,
  stripeInboxCreditKind,
  stripeInboxCreditLabel,
  stripeInboxFromIntent,
  stripeInboxMethod,
  stripeSafeMetadata,
  stripeSuggestedCustomerId,
} from "./stripe-inbox";
import { matchStripeReasonLabel } from "./stripe-labels";

const base = {
  id: "pi_1",
  status: "succeeded",
  amount: 12500,
  currency: "eur",
  description: "Séjour Rome",
  receiptEmail: "ada@exemple.fr",
  created: 1_700_000_000,
  customerId: "cus_1",
  metadata: { pay_method: "card", crm_customer_id: "cust-1" },
  charge: { name: "Ada Martin", email: "ada@exemple.fr", type: "card", last4: "4242" },
};

test("un paiement réussi et positif entre dans la file", () => {
  assert.equal(shouldIngestStripeForRapprochement({ status: "succeeded", amountCents: 100, payMethod: "card" }), true);
  assert.equal(shouldIngestStripeForRapprochement({ status: "processing", amountCents: 100 }), false);
  assert.equal(shouldIngestStripeForRapprochement({ status: "succeeded", amountCents: 0 }), false);
  assert.equal(shouldIngestStripeForRapprochement({ status: "succeeded", amountCents: -50 }), false);
  assert.equal(
    shouldIngestStripeForRapprochement({ status: "succeeded", amountCents: 100, payMethod: "revolut" }),
    false
  );
});

test("le moyen distingue la carte, Apple Pay et le prélèvement", () => {
  assert.equal(stripeInboxMethod({ payMethod: "card" }), "card");
  assert.equal(stripeInboxMethod({ wallet: "apple_pay" }), "apple_pay");
  assert.equal(stripeInboxMethod({ payMethod: "sepa_debit" }), "sepa");
  assert.equal(stripeInboxMethod({ chargeType: "sepa_debit" }), "sepa");
  assert.equal(stripeInboxMethod({ chargeType: "klarna" }), "other");
  assert.equal(stripeInboxCreditKind("sepa"), "transfer");
  assert.equal(stripeInboxCreditKind("card"), "card_payment");
  assert.equal(stripeInboxCreditKind("apple_pay"), "card_payment");
  assert.equal(stripeInboxCreditKind("other"), "card_payment");
});

test("le brouillon de file ne garde pas un numéro de carte", () => {
  const dropped = stripeSafeMetadata({ note: "4111111111111111", pay_method: "card" });
  assert.equal(dropped.note, undefined);
  assert.equal(dropped.pay_method, "card");

  const draft = stripeInboxFromIntent(base);
  assert.ok(draft);
  assert.equal(draft.amount, 125);
  assert.equal(draft.currency, "EUR");
  assert.equal(draft.method, "card");
  assert.equal(draft.last4, "4242");
  assert.equal(draft.payer_name, "Ada Martin");
  assert.equal(draft.reference, "Séjour Rome");
  assert.equal(draft.raw.last4, "4242");
  assert.equal("number" in draft.raw, false);
  assert.equal(JSON.stringify(draft.raw).includes("4111"), false);
  assert.equal(stripeInboxCreditLabel({ payerName: draft.payer_name, method: draft.method }), "Règlement Stripe · Ada Martin · Carte");
  assert.deepEqual(stripeInboxCopy(draft), { sender: "Ada Martin", designation: "Séjour Rome" });
});

test("un virement Revolut, un statut ouvert ou un montant nul ne créent pas de ligne", () => {
  assert.equal(stripeInboxFromIntent({ ...base, metadata: { pay_method: "revolut" } }), null);
  assert.equal(stripeInboxFromIntent({ ...base, status: "requires_payment_method" }), null);
  assert.equal(stripeInboxFromIntent({ ...base, amount: 0 }), null);
  assert.equal(stripeInboxFromIntent({ ...base, id: "  " }), null);
});

test("une seule proposition certaine est présélectionnée", () => {
  assert.equal(
    stripeSuggestedCustomerId([
      { customer_id: "a", score: 100 },
      { customer_id: "b", score: 70 },
    ]),
    "a"
  );
  assert.equal(
    stripeSuggestedCustomerId([
      { customer_id: "a", score: 100 },
      { customer_id: "b", score: 100 },
    ]),
    ""
  );
  assert.equal(matchStripeReasonLabel("email"), "E-mail");
  assert.equal(matchStripeReasonLabel("partial"), "Correspondance partielle");
});

test("Apple Pay vient du portefeuille, le last4 invalide est ignoré", () => {
  const draft = stripeInboxFromIntent({
    ...base,
    metadata: {},
    charge: { name: "Ada Martin", type: "card", last4: "42", wallet: "apple_pay" },
  });
  assert.equal(draft?.method, "apple_pay");
  assert.equal(draft?.last4, null);
  assert.equal(stripeInboxCopy({ payer_name: "", reference: "" }).sender, "Payeur inconnu");
});
