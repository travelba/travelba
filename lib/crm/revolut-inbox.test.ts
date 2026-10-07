import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRevolutCredit,
  revolutDebitLine,
  revolutInboxCopy,
  revolutInboxDraft,
  senderFromRevolutPayload,
  shouldIngestRevolutDebit,
  shouldIngestRevolutForRapprochement,
} from "./revolut-inbox";

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
    assert.equal(
      shouldIngestRevolutForRapprochement({
        type: "exchange",
        signedAmount: 400,
        reference: null,
      }),
      false
    );
  });

  it("range les sorties complétées dans les débits, pas les autorisations en attente", () => {
    assert.equal(shouldIngestRevolutDebit({ signedAmount: -850, state: "completed" }), true);
    assert.equal(shouldIngestRevolutDebit({ signedAmount: -40, state: "pending" }), false);
    assert.equal(shouldIngestRevolutDebit({ signedAmount: 1200, state: "completed" }), false);
    const topup = revolutInboxDraft({
      id: "tx-in",
      type: "topup",
      state: "completed",
      reference: "Acompte",
      legs: [{ amount: 1200, currency: "EUR", description: "Payment from Boukris SAS" }],
    });
    assert.equal(topup?.direction, "credit");
    assert.equal(topup?.status, "unmatched");
    assert.equal(topup?.counterparty_name, "Boukris SAS");
    const wire = revolutInboxDraft({
      id: "tx-out",
      type: "transfer",
      state: "completed",
      reference: "FACTURE 12",
      completed_at: "2026-03-12T10:00:00Z",
      legs: [
        {
          amount: -850,
          currency: "EUR",
          description: "To Hotel Nantipa",
          counterparty: { name: "Hotel Nantipa", iban: "FR76SECRET" },
        },
      ],
    });
    assert.equal(wire?.direction, "debit");
    assert.equal(wire?.status, "ignored");
    assert.equal(wire?.amount, 850);
    assert.equal(wire?.counterparty_name, "Hotel Nantipa");
    const card = revolutInboxDraft({
      id: "tx-card",
      type: "card_payment",
      state: "completed",
      merchant: { name: "SNCF" },
      legs: [{ amount: -86, currency: "EUR", description: "SNCF" }],
    });
    assert.equal(card?.direction, "debit");
    assert.equal(card?.counterparty_name, "SNCF");
    assert.equal(
      revolutInboxDraft({
        id: "tx-wait",
        type: "card_payment",
        state: "pending",
        legs: [{ amount: -10, currency: "EUR" }],
      }),
      null
    );
    const exchange = revolutInboxDraft({
      id: "tx-fx",
      type: "exchange",
      state: "completed",
      legs: [
        { amount: 100, currency: "USD" },
        { amount: -92, currency: "EUR", description: "Exchange" },
      ],
    });
    assert.equal(exchange?.direction, "debit");
    assert.equal(exchange?.amount, 92);
    assert.equal(exchange?.currency, "EUR");
    const line = revolutDebitLine({
      id: "row",
      amount: 850,
      currency: "EUR",
      counterparty_name: "Hotel Nantipa",
      reference: "FACTURE 12",
      booked_at: "2026-03-12",
      raw: { type: "transfer", legs: [{ counterparty: { iban: "FR76SECRET" } }] },
    });
    assert.equal(line.party, "Hotel Nantipa");
    assert.equal(line.kind, "Virement");
    assert.equal(line.reference, "FACTURE 12");
    assert.equal("iban" in line, false);
  });

  it("traite une direction vide comme un crédit", () => {
    assert.equal(isRevolutCredit("credit"), true);
    assert.equal(isRevolutCredit(null), true);
    assert.equal(isRevolutCredit("debit"), false);
  });

  it("prend l’expéditeur dans Payment from, pas la désignation", () => {
    assert.equal(
      senderFromRevolutPayload({
        description: "Payment from Boukris SAS",
        counterpartyName: null,
      }),
      "Boukris SAS"
    );
    const copy = revolutInboxCopy({
      counterparty_name: "Acompte stage",
      reference: "Acompte stage",
      raw: {
        legs: [{ description: "Payment from Boukris SAS" }],
      },
    });
    assert.equal(copy.sender, "Boukris SAS");
    assert.equal(copy.designation, "Acompte stage");
  });
});
