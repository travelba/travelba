import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRevolutCredit, shouldIngestRevolutForRapprochement } from "./revolut-inbox";

describe("revolut-inbox", () => {
  it("n’ingère que les crédits (hors Stripe, cartes, sorties)", () => {
    assert.equal(
      shouldIngestRevolutForRapprochement({
        type: "topup",
        signedAmount: 1200,
        reference: "VIR SEPA DUPONT",
      }),
      true
    );
    assert.equal(
      shouldIngestRevolutForRapprochement({
        type: "transfer",
        signedAmount: -850,
        reference: "HOTEL NANTIPA",
      }),
      false
    );
    assert.equal(
      shouldIngestRevolutForRapprochement({
        type: "card_payment",
        signedAmount: 40,
        reference: null,
      }),
      false
    );
    assert.equal(
      shouldIngestRevolutForRapprochement({
        type: "topup",
        signedAmount: 200,
        reference: "STRIPE",
      }),
      false
    );
  });

  it("traite une direction vide comme un crédit", () => {
    assert.equal(isRevolutCredit("credit"), true);
    assert.equal(isRevolutCredit(null), true);
    assert.equal(isRevolutCredit("debit"), false);
  });
});
