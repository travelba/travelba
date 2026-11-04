import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyRevolutCredit,
  classifyStoredRevolut,
  revolutPendingReclass,
  revolutRowCollectable,
} from "./revolut-classify";

describe("revolut-classify", () => {
  it("range les intérêts, le versement Stripe, l’interne et le remboursement hors crédit client", () => {
    assert.equal(
      classifyRevolutCredit({
        type: "interest",
        description: "Interest earned - treso",
      }).category,
      "interet"
    );
    assert.equal(
      classifyRevolutCredit({
        type: "topup",
        description: "Payment from Stripe",
        reference: "ENCAISSEMENT CLIENT",
        counterpartyName: "Stripe",
      }).category,
      "stripe"
    );
    assert.equal(
      classifyRevolutCredit({
        type: "transfer",
        description: "From treso",
        counterpartyName: "From treso",
      }).category,
      "interne"
    );
    assert.equal(
      classifyRevolutCredit({
        type: "transfer",
        legs: [
          { amount: 100, account_id: "a" },
          { amount: -100, account_id: "b" },
        ],
      }).category,
      "interne"
    );
    assert.equal(classifyRevolutCredit({ type: "card_refund", description: "Refund" }).category, "remboursement");
    assert.equal(classifyRevolutCredit({ type: "refund" }).category, "remboursement");
    assert.equal(
      classifyRevolutCredit({
        type: "topup",
        description: "Payment from Boukris SAS",
        reference: "Acompte",
        counterpartyName: "Boukris SAS",
      }).category,
      "client"
    );
  });

  it("ne reclasse pas un crédit déjà posé, et sort les intérêts encore ouverts", () => {
    const interest = {
      status: "unmatched",
      direction: "credit",
      raw: { type: "interest", legs: [{ description: "Interest earned - treso", amount: 2.13 }] },
      counterparty_name: null,
      reference: null,
    };
    assert.deepEqual(revolutPendingReclass(interest), { category: "interet", status: "ignored" });
    assert.equal(
      revolutPendingReclass({ ...interest, status: "matched", matched_transaction_id: "tx" }),
      null
    );
    assert.equal(revolutPendingReclass({ ...interest, status: "ignored", category: "interet" }), null);
    assert.equal(revolutRowCollectable({ status: "unmatched", category: "interet" }), false);
    assert.equal(revolutRowCollectable({ status: "unmatched", category: "stripe" }), false);
    assert.equal(
      revolutRowCollectable({ status: "unmatched", category: "stripe_paiement", stripe_line: { deja_encaisse: true } }),
      false
    );
    assert.equal(revolutRowCollectable({ status: "unmatched", category: "stripe_paiement" }), true);
    assert.equal(classifyStoredRevolut(interest).label, "Intérêts Revolut");
  });
});
