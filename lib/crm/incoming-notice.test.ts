import assert from "node:assert/strict";
import test from "node:test";
import {
  admitIncomingNotice,
  redactPaymentSecrets,
  revolutNoticeKey,
  shouldAlertRevolutTransfer,
  stripeNoticeKey,
  wireReceivedSummary,
} from "./incoming-notice";

test("un virement entrant s’annonce une fois, une sortie jamais", () => {
  const seen = new Set<string>();
  assert.equal(shouldAlertRevolutTransfer({ direction: "credit", category: "client" }), true);
  assert.equal(shouldAlertRevolutTransfer({ direction: "debit", category: null }), false);
  assert.equal(shouldAlertRevolutTransfer({ direction: "credit", category: "interet" }), false);
  assert.equal(admitIncomingNotice(seen, { id: "tx-1", direction: "credit", category: "client" }), true);
  assert.equal(admitIncomingNotice(seen, { id: "tx-1", direction: "credit", category: "client" }), false);
  assert.equal(seen.has(revolutNoticeKey("tx-1")), true);
  assert.equal(admitIncomingNotice(seen, { id: "tx-out", direction: "debit" }), false);
  assert.equal(seen.has(revolutNoticeKey("tx-out")), false);
  assert.equal(admitIncomingNotice(seen, { id: "tx-fee", direction: "credit", category: "frais" }), false);
});

test("le rattrapage Stripe se dédoublonne par PaymentIntent", () => {
  const seen = new Set<string>();
  const key = stripeNoticeKey("pi_3UcUPVEq8Jx28Xgo1bDIGvEI");
  assert.equal(admitIncomingNotice(seen, { id: "pi_3UcUPVEq8Jx28Xgo1bDIGvEI", key }), true);
  assert.equal(admitIncomingNotice(seen, { id: "pi_3UcUPVEq8Jx28Xgo1bDIGvEI", key }), false);
  assert.equal(seen.size, 1);
});

test("l’alerte de virement ne garde ni IBAN ni numéro de carte", () => {
  const summary = wireReceivedSummary({
    amount: 4450.55,
    currency: "EUR",
    payer: "Boukris FR76 1234 5678 9012 3456 7890 123",
    client: "Raphaël Boukris",
    reference: "séjour TB-2026-0148",
  });
  assert.match(summary, /^Virement reçu · /);
  assert.match(summary, /Raphaël Boukris/);
  assert.match(summary, /TB-2026-0148/);
  assert.equal(/FR76/i.test(summary), false);
  assert.match(summary, /····0123/);
  const card = redactPaymentSecrets("carte 4242 4242 4242 4242");
  assert.equal(card.includes("4242 4242"), false);
  assert.match(card, /····4242/);
});
