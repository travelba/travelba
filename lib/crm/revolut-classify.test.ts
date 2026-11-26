import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyRevolutCredit,
  classifyStoredRevolut,
  revolutCreditInboxStatus,
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

  it("garde treso et trésorerie internes, et laisse un tiers Treso… à encaisser", () => {
    for (const description of ["From treso", "To treso", "To trésorerie", "FROM TRESORERIE"]) {
      const klass = classifyRevolutCredit({
        type: "transfer",
        description,
        counterpartyName: description,
      });
      assert.equal(klass.category, "interne", description);
      assert.equal(revolutCreditInboxStatus(klass.category), "ignored", description);
    }
    for (const description of ["Payment from Tresolend Sas", "Payment from Tresobank", "To Tresovoyages"]) {
      const klass = classifyRevolutCredit({
        type: "topup",
        description,
        reference: description.startsWith("Payment from Tresolend") ? "REL-20261120" : "FAC-1",
        counterpartyName: description.replace(/^(?:Payment from|To)\s+/i, ""),
      });
      assert.equal(klass.category, "client", description);
      assert.equal(revolutCreditInboxStatus(klass.category), "unmatched", description);
    }
  });

  it("rouvre un interne automatique devenu client, pas un refus manuel ni un crédit posé", () => {
    const tresolend = {
      status: "ignored" as const,
      direction: "credit",
      category: "interne" as const,
      raw: {
        type: "topup",
        legs: [
          {
            description: "Payment from Tresolend Sas",
            amount: 10719.34,
            counterparty: { name: "Tresolend Sas" },
          },
        ],
      },
      counterparty_name: "Tresolend Sas",
      reference: "REL-20261120",
    };
    assert.deepEqual(revolutPendingReclass(tresolend), { category: "client", status: "unmatched" });
    assert.equal(revolutRowCollectable({ status: "unmatched", category: "client" }), true);
    assert.equal(revolutPendingReclass({ ...tresolend, status: "matched", matched_transaction_id: "tx" }), null);
    assert.equal(revolutPendingReclass({ ...tresolend, status: "unmatched", matched_transaction_id: "tx" }), null);
    assert.equal(
      revolutPendingReclass({ ...tresolend, settled_at: "2026-11-20T10:00:00.000Z" }),
      null
    );
    assert.equal(revolutPendingReclass({ ...tresolend, category: "client" }), null);
    assert.equal(
      revolutPendingReclass({
        status: "ignored",
        direction: "credit",
        category: "client",
        raw: tresolend.raw,
        counterparty_name: "Tresolend Sas",
        reference: "REL-20261120",
      }),
      null
    );
    assert.equal(
      revolutPendingReclass({
        status: "ignored",
        direction: "credit",
        category: "interne",
        raw: { type: "transfer", legs: [{ description: "From treso", amount: 1000 }] },
        counterparty_name: "From treso",
        reference: null,
      }),
      null
    );
    assert.equal(
      revolutPendingReclass({
        status: "ignored",
        direction: "credit",
        category: "interne",
        raw: { type: "transfer", legs: [{ description: "To trésorerie", amount: 500 }] },
        counterparty_name: "To trésorerie",
        reference: null,
      }),
      null
    );
    assert.deepEqual(
      revolutPendingReclass({ ...tresolend, status: "unmatched" }),
      { category: "client" }
    );
  });
});
