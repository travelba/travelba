import assert from "node:assert/strict";
import test from "node:test";
import { scoreStripeMatches, type StripeMatchCustomer } from "./stripe-match";
import { stripeInboxFromIntent } from "./stripe-inbox";
import { createCrmPaymentLink } from "./stripe-payment-link";
import {
  crmPaymentLinkParams,
  resolveStripePayer,
  suggestStripePayers,
} from "./stripe-payer";

const ADA: StripeMatchCustomer = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  first_name: "Ada",
  last_name: "Martin",
  company_name: null,
  email: "ada@exemple.fr",
  stripe_customer_id: null,
};

test("un lien de paiement avec client Stripe et sans facturation retrouve l'e-mail et le nom", () => {
  const payer = resolveStripePayer({
    billingEmail: null,
    billingName: null,
    receiptEmail: null,
    description: null,
    customerEmail: "Ada@Exemple.fr",
    customerName: "Ada Martin",
    checkoutSessionId: "cs_link",
    paymentLinkId: "plink_1",
    customFields: [{ label: "Désignation", value: "2108" }],
    productName: "Séjour",
  });
  assert.equal(payer.email, "Ada@Exemple.fr");
  assert.equal(payer.name, "Ada Martin");
  assert.equal(payer.designation, "2108");
  assert.equal(payer.raw.customer_email, "Ada@Exemple.fr");
  assert.equal(payer.raw.customer_name, "Ada Martin");
  assert.equal(payer.raw.checkout_session_id, "cs_link");
  assert.equal(payer.raw.payment_link_id, "plink_1");
  assert.equal(payer.raw.custom_fields[0]?.value, "2108");

  const draft = stripeInboxFromIntent({
    id: "pi_link",
    status: "succeeded",
    amount: 343800,
    currency: "eur",
    description: null,
    customerId: "cus_VONZEIAlZldNBM",
    charge: { type: "card", last4: "4242" },
    payer,
  });
  assert.ok(draft);
  assert.equal(draft.payer_email, "Ada@Exemple.fr");
  assert.equal(draft.payer_name, "Ada Martin");
  assert.equal(draft.reference, "2108");
  assert.equal(draft.raw.customer_email, "Ada@Exemple.fr");
  assert.equal(draft.raw.invoice_id, null);
  assert.equal(JSON.stringify(draft.raw).includes("4242") ? draft.raw.last4 : null, "4242");
  assert.equal(JSON.stringify(draft.raw).includes("4111"), false);
});

test("une session Checkout donne l'e-mail et le nom de customer_details", () => {
  const payer = resolveStripePayer({
    billingEmail: "",
    billingName: "",
    sessionEmail: "leo@exemple.fr",
    sessionName: "Léo Martin",
    checkoutSessionId: "cs_checkout",
    description: "Séjour Rome",
  });
  assert.equal(payer.email, "leo@exemple.fr");
  assert.equal(payer.name, "Léo Martin");
  assert.equal(payer.designation, "Séjour Rome");
  assert.equal(payer.raw.customer_email, null);
});

test("sans aucun identifiant, le payeur reste vide", () => {
  const payer = resolveStripePayer({});
  assert.equal(payer.email, null);
  assert.equal(payer.name, null);
  assert.equal(payer.designation, null);
  assert.deepEqual(payer.raw.custom_fields, []);
  const suggestions = suggestStripePayers({ customers: [ADA] });
  assert.deepEqual(suggestions, []);
  const scored = scoreStripeMatches(
    {
      payer_name: null,
      payer_email: null,
      reference: null,
      raw: {},
    },
    [ADA]
  );
  assert.equal(scored.autoCustomerId, null);
  assert.equal(scored.candidates.length, 0);
});

test("l'e-mail, l'historique et la pièce proposent sans créditer", () => {
  const email = suggestStripePayers({
    email: "ADA@exemple.fr",
    stripeCustomerId: "cus_ada",
    customers: [ADA],
    history: [{ stripeCustomerId: "cus_ada", customerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
  });
  assert.equal(email.length, 1);
  assert.equal(email[0]?.reason, "email");
  assert.ok(email[0]!.score < 90);

  const history = suggestStripePayers({
    stripeCustomerId: "cus_ada",
    customers: [ADA],
    history: [{ stripeCustomerId: "cus_ada", customerId: ADA.id }],
  });
  assert.equal(history[0]?.reason, "stripe_history");
  assert.equal(history[0]?.customerId, ADA.id);

  const piece = scoreStripeMatches(
    { payer_name: null, payer_email: null, reference: "2108", raw: { stripe_customer_id: "cus_inconnu" } },
    [ADA],
    { pieces: [{ number: "FA-2108", customerId: ADA.id, bookingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", reference: "TB-2026-0001" }] }
  );
  assert.equal(piece.autoCustomerId, null);
  assert.equal(piece.candidates[0]?.reason, "piece");
  assert.equal(piece.candidates[0]?.customer_id, ADA.id);
});

test("un lien créé par le CRM exige l'e-mail et la référence du dossier", async () => {
  const missing = crmPaymentLinkParams({ email: "", reference: "TB-2026-2108", priceId: "price_1" });
  assert.equal(missing.ok, false);

  const params = crmPaymentLinkParams({
    email: "ada@exemple.fr",
    reference: "TB-2026-2108",
    bookingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    priceId: "price_1",
  });
  assert.equal(params.ok, true);
  if (!params.ok) return;
  assert.equal(params.params.metadata.reference, "TB-2026-2108");
  assert.equal(params.params.payment_intent_data.metadata.reference, "TB-2026-2108");
  assert.equal(params.params.payment_intent_data.metadata.crm_booking_id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  assert.equal(params.params.customer_creation, "always");

  let called = 0;
  const refused = await createCrmPaymentLink(
    { paymentLinks: { create: async () => { called += 1; return { id: "plink", url: "https://buy.stripe.com/x" }; } } } as never,
    { email: "pas-un-mail", reference: "TB-2026-2108", priceId: "price_1" }
  );
  assert.equal(refused.ok, false);
  assert.equal(called, 0);

  const created = await createCrmPaymentLink(
    { paymentLinks: { create: async (body: { metadata: { reference: string } }) => { called += 1; assert.equal(body.metadata.reference, "TB-2026-2108"); return { id: "plink_1", url: "https://buy.stripe.com/abc" }; } } } as never,
    { email: "ada@exemple.fr", reference: "TB-2026-2108", bookingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", priceId: "price_1" }
  );
  assert.equal(created.ok, true);
  if (created.ok) assert.equal(created.url, "https://buy.stripe.com/abc");
  assert.equal(called, 1);
});
