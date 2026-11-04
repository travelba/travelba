import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStripeSplit,
  matchStripePayout,
  splitWrite,
  stripeLiveKey,
  stripeSplitSums,
  type BalanceLineSnapshot,
} from "./stripe-payout";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const POSTED = "33333333-3333-4333-8333-333333333333";

function line(partial: Partial<BalanceLineSnapshot> & Pick<BalanceLineSnapshot, "id" | "type" | "amountCents">): BalanceLineSnapshot {
  return {
    feeCents: 0,
    netCents: partial.amountCents,
    description: null,
    sourceId: partial.id,
    paymentIntentId: null,
    chargeId: null,
    name: null,
    email: null,
    metadata: {},
    ...partial,
  };
}

describe("stripe-payout", () => {
  it("n’interroge Stripe qu’avec une clé live", () => {
    assert.equal(stripeLiveKey("sk_test_example"), false);
    assert.equal(stripeLiveKey("rk_test_example"), false);
    assert.equal(stripeLiveKey(""), false);
    assert.equal(stripeLiveKey("sk_live_example"), true);
    assert.equal(stripeLiveKey("rk_live_example"), true);
  });

  it("rapproche le versement au montant et au jour", () => {
    const hit = matchStripePayout(
      { amount: 1053.49, currency: "EUR", bookedAt: "2026-11-03T06:57:08.354Z" },
      [
        { id: "po_autre", amountCents: 941145, currency: "eur", arrivalDate: Date.parse("2026-10-30T00:00:00Z") / 1000, created: 0, status: "paid" },
        { id: "po_jour", amountCents: 105349, currency: "eur", arrivalDate: Date.parse("2026-11-03T00:00:00Z") / 1000, created: 0, status: "paid" },
        { id: "po_ko", amountCents: 105349, currency: "eur", arrivalDate: Date.parse("2026-11-03T00:00:00Z") / 1000, created: 1, status: "failed" },
      ]
    );
    assert.equal(hit?.id, "po_jour");
  });

  it("découpe 1 053,49 € en bruts plus les frais d’agence, sans second crédit", () => {
    const built = buildStripeSplit({
      parent: {
        revolutTransactionId: "rev-1053",
        amount: 1053.49,
        currency: "EUR",
        bookedAt: "2026-11-03T06:57:08.354Z",
      },
      payoutId: "po_jour",
      balance: [
        line({
          id: "txn_a",
          type: "charge",
          amountCents: 60000,
          feeCents: 1500,
          netCents: 58500,
          paymentIntentId: "pi_a",
          chargeId: "ch_a",
          name: "Camille Martin",
          email: "camille@example.com",
          metadata: { crm_customer_id: CUSTOMER, crm_booking_id: BOOKING, reference: "TB-2026-0101" },
        }),
        line({
          id: "txn_b",
          type: "charge",
          amountCents: 48000,
          feeCents: 1151,
          netCents: 46849,
          paymentIntentId: "pi_b",
          chargeId: "ch_b",
          name: "Alex Martin",
          email: "alex@example.com",
        }),
        line({ id: "txn_out", type: "payout", amountCents: -105349, netCents: -105349 }),
      ],
      links: {
        customers: [{ id: CUSTOMER, email: "camille@example.com", stripe_customer_id: null }],
        bookings: [{ id: BOOKING, reference: "TB-2026-0101", customer_id: CUSTOMER }],
        posted: [{ id: POSTED, customer_id: CUSTOMER, external_id: "pi_a" }],
      },
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.drafts.length, 3);
    const [first, second, fee] = built.drafts;
    assert.equal(first.category, "stripe_paiement");
    assert.equal(first.amount, 600);
    assert.equal(first.status, "matched");
    assert.equal(first.matched_transaction_id, POSTED);
    assert.equal(first.stripe_line.deja_encaisse, true);
    assert.equal(first.stripe_line.customer_id, CUSTOMER);
    assert.equal(first.stripe_line.booking_id, BOOKING);
    assert.equal(first.stripe_line.email, "camille@example.com");
    assert.equal(second.amount, 480);
    assert.equal(second.status, "unmatched");
    assert.equal(second.stripe_line.deja_encaisse, false);
    assert.equal(second.stripe_line.fee, 11.51);
    assert.equal(fee.category, "frais");
    assert.equal(fee.status, "ignored");
    assert.equal(fee.amount, -26.51);
    assert.equal(stripeSplitSums(1053.49, built.drafts), true);
    assert.equal(splitWrite(null, second).op, "insert");
    const kept = splitWrite({ status: "ignored" }, second);
    assert.equal(kept.op, "update");
    assert.equal("status" in kept ? kept.status : undefined, undefined);
    const linked = splitWrite({ status: "unmatched" }, first);
    assert.equal("status" in linked ? linked.status : undefined, "matched");
    const frozen = splitWrite({ status: "matched" }, second);
    assert.equal("status" in frozen ? frozen.status : undefined, undefined);
    const again = buildStripeSplit({
      parent: {
        revolutTransactionId: "rev-1053",
        amount: 1053.49,
        currency: "EUR",
        bookedAt: "2026-11-03T06:57:08.354Z",
      },
      payoutId: "po_jour",
      balance: [
        line({
          id: "txn_a",
          type: "charge",
          amountCents: 60000,
          feeCents: 1500,
          netCents: 58500,
          paymentIntentId: "pi_a",
          name: "Camille Martin",
        }),
        line({
          id: "txn_b",
          type: "charge",
          amountCents: 48000,
          feeCents: 1151,
          netCents: 46849,
          paymentIntentId: "pi_b",
          name: "Alex Martin",
        }),
      ],
      links: { customers: [], bookings: [], posted: [] },
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.deepEqual(
      again.drafts.map((draft) => draft.revolut_transaction_id),
      built.drafts.map((draft) => draft.revolut_transaction_id)
    );
  });
});
