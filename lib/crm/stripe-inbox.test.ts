import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldIngestStripeForRapprochement,
  stripeCrmPayerName,
  stripeInboxCopy,
  stripeInboxCreditKind,
  stripeInboxCreditLabel,
  stripeInboxFromIntent,
  stripeInboxMethod,
  stripeInboxRefreshPatch,
  stripeIntentIdsToRefresh,
  stripeIntentInputFromSnapshot,
  stripeNeedsCheckoutPayer,
  stripePayerFromSources,
  stripeProposedCustomerId,
  stripeRawNeedsPayerRefresh,
  stripeSafeMetadata,
  stripeSuggestedCustomerId,
  STRIPE_PAYER_RESOLUTION,
} from "./stripe-inbox";
import { matchStripeReasonLabel, stripeDossierCaption, stripeSyncSummary } from "./stripe-labels";

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
  assert.equal(stripeInboxCopy({ payer_name: "", reference: "" }).designation, "");
  assert.deepEqual(stripeInboxCopy({ payer_name: "", reference: "sejour Maroc" }), {
    sender: "Payeur inconnu",
    designation: "sejour Maroc",
  });
  assert.deepEqual(stripeInboxCopy({ payer_name: "", reference: "tHOMAS" }), {
    sender: "Payeur inconnu",
    designation: "tHOMAS",
  });
});

test("le payeur suit metadata CRM, facturation, customer, session, puis les e-mails", () => {
  const order = stripePayerFromSources({
    crmName: "Camille Negoce",
    billingName: "Facture",
    customerName: "CAM NEGOCE",
    checkoutName: "Session",
    checkoutEmail: "session@exemple.fr",
    billingEmail: "carte@exemple.fr",
    customerEmail: "customer@exemple.fr",
  });
  assert.equal(order.name, "Camille Negoce");
  assert.equal(order.email, "carte@exemple.fr");

  const customer = stripePayerFromSources({
    customerName: "CAM NEGOCE",
    customerEmail: "cam@exemple.fr",
    billingEmail: "",
  });
  assert.equal(customer.name, "CAM NEGOCE");
  assert.equal(customer.email, "cam@exemple.fr");

  const business = stripePayerFromSources({ customerBusinessName: "CAM NEGOCE", customerEmail: "cam@exemple.fr" });
  assert.equal(business.name, "CAM NEGOCE");

  const session = stripePayerFromSources({
    checkoutName: "Léa Martin",
    checkoutEmail: "lea@exemple.fr",
    billingEmail: "carte@exemple.fr",
    customerEmail: "customer@exemple.fr",
  });
  assert.equal(session.name, "Léa Martin");
  assert.equal(session.email, "carte@exemple.fr");

  const sessionMail = stripePayerFromSources({
    checkoutEmail: "lea@exemple.fr",
    billingEmail: "carte@exemple.fr",
  });
  assert.equal(sessionMail.name, "lea@exemple.fr");

  const receipt = stripePayerFromSources({ receiptEmail: "recu@exemple.fr", customerEmail: "customer@exemple.fr" });
  assert.equal(receipt.name, "recu@exemple.fr");
  assert.equal(receipt.email, "recu@exemple.fr");

  const onlyCustomerMail = stripePayerFromSources({ customerEmail: "customer@exemple.fr" });
  assert.equal(onlyCustomerMail.name, "customer@exemple.fr");
  assert.equal(stripePayerFromSources({}).name, null);
});

test("un customer Stripe sans nom de facturation devient le payeur, la description reste", () => {
  const input = stripeIntentInputFromSnapshot({
    id: "pi_cam",
    status: "succeeded",
    amount: 120000,
    currency: "eur",
    description: null,
    receipt_email: null,
    created: 1_700_000_000,
    metadata: {},
    customer: { id: "cus_VONZEIAlZldNBM", name: "CAM NEGOCE", email: "cam@exemple.fr" },
    latest_charge: {
      description: "2108",
      billing_details: { name: null, email: null },
      payment_method_details: { type: "card", card: { last4: "6004", wallet: null } },
    },
  });
  assert.equal(stripeNeedsCheckoutPayer(input), false);
  const draft = stripeInboxFromIntent(input);
  assert.equal(draft?.payer_name, "CAM NEGOCE");
  assert.equal(draft?.payer_email, "cam@exemple.fr");
  assert.equal(draft?.reference, "2108");
  assert.equal(draft?.last4, "6004");
  assert.equal(draft?.raw.payer_resolution, STRIPE_PAYER_RESOLUTION);
  assert.equal(draft?.raw.last4, "6004");
  assert.equal("number" in (draft?.raw || {}), false);
  const patch = stripeInboxRefreshPatch(draft!);
  assert.equal("status" in patch, false);
  assert.equal("matched_customer_id" in patch, false);
  assert.equal("matched_transaction_id" in patch, false);
});

test("la session Checkout et le nom CRM passent avant l’e-mail de la carte", () => {
  const checkout = stripeInboxFromIntent({
    ...base,
    metadata: {},
    charge: { name: null, email: "carte@exemple.fr", type: "card", last4: "6004" },
    customer: { name: null, email: "customer@exemple.fr" },
    checkout: { name: null, email: "lea@exemple.fr" },
    receiptEmail: null,
  });
  assert.equal(checkout?.payer_name, "lea@exemple.fr");
  assert.equal(checkout?.payer_email, "carte@exemple.fr");

  const crm = stripeCrmPayerName(
    { crm_customer_id: "cust-cam" },
    [{ id: "cust-cam", first_name: "Camille", last_name: "Negoce", company_name: "CAM NEGOCE" }],
    []
  );
  assert.equal(crm, "Camille Negoce");
  const viaBooking = stripeCrmPayerName(
    { reference: "TB-2026-2108" },
    [{ id: "cust-cam", first_name: "", last_name: "", company_name: "CAM NEGOCE" }],
    [{ reference: "TB-2026-2108", customer_id: "autre", billing_customer_id: "cust-cam" }]
  );
  assert.equal(viaBooking, "CAM NEGOCE");
  const named = stripeInboxFromIntent({ ...base, charge: { name: "Carte", type: "card" }, crmPayerName: crm });
  assert.equal(named?.payer_name, "Camille Negoce");
});

test("la relecture ne reprend que les crédits sans résolution, sans toucher ceux déjà lus", () => {
  assert.equal(stripeRawNeedsPayerRefresh({}), true);
  assert.equal(stripeRawNeedsPayerRefresh({ payer_resolution: 1 }), true);
  assert.equal(stripeRawNeedsPayerRefresh({ payer_resolution: STRIPE_PAYER_RESOLUTION }), false);
  assert.deepEqual(
    stripeIntentIdsToRefresh(
      [
        { stripe_payment_intent_id: "pi_old", raw: {} },
        { stripe_payment_intent_id: "pi_new", raw: { payer_resolution: STRIPE_PAYER_RESOLUTION } },
        { stripe_payment_intent_id: "pi_seen", raw: {} },
      ],
      new Set(["pi_seen"]),
      10
    ),
    ["pi_old"]
  );
  assert.equal(stripeSyncSummary(2, 1, 0, 3), "Synchronisation terminée : 2 paiements lus, 1 nouveau, 3 payeurs recalculés.");
  assert.equal(matchStripeReasonLabel("dossier"), "Dossier");
  assert.equal(matchStripeReasonLabel("facture"), "Facture");
  assert.equal(stripeDossierCaption({ reason: "facture", label: "Facture 2108 · TB-2026-2108" }), "Facture proposée : Facture 2108 · TB-2026-2108");
  assert.equal(stripeProposedCustomerId([{ customer_id: "a", score: 75, reason: "dossier" }]), "a");
  assert.equal(stripeProposedCustomerId([{ customer_id: "a", score: 70, reason: "company_name" }]), "a");
  assert.equal(stripeProposedCustomerId([{ customer_id: "a", score: 80, reason: "full_name" }]), "");
  assert.equal(stripeSuggestedCustomerId([{ customer_id: "a", score: 75 }]), "");
});
