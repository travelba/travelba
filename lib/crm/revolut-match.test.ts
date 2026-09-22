import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchReasonLabel,
  normalizeMatchText,
  scoreRevolutMatches,
  suggestionsForCustomer,
} from "./revolut-match";
import type { CrmCustomer, CrmRevolutTransaction } from "./types";

function customer(
  partial: Partial<CrmCustomer> & Pick<CrmCustomer, "id" | "first_name" | "last_name">
): Pick<CrmCustomer, "id" | "first_name" | "last_name" | "company_name"> {
  return {
    id: partial.id,
    first_name: partial.first_name,
    last_name: partial.last_name,
    company_name: partial.company_name ?? null,
  };
}

function row(
  partial: Partial<CrmRevolutTransaction> & Pick<CrmRevolutTransaction, "id">
): CrmRevolutTransaction {
  return {
    id: partial.id,
    revolut_transaction_id: partial.revolut_transaction_id || `rev-${partial.id}`,
    amount: partial.amount ?? 100,
    currency: partial.currency || "EUR",
    counterparty_name: partial.counterparty_name ?? null,
    counterparty_iban: partial.counterparty_iban ?? null,
    reference: partial.reference ?? null,
    booked_at: partial.booked_at ?? "2026-09-01T10:00:00Z",
    raw: {},
    matched_customer_id: null,
    matched_transaction_id: null,
    status: partial.status || "unmatched",
    created_at: "",
    updated_at: "",
  };
}

describe("revolut-match", () => {
  it("normalizes accents and punctuation", () => {
    assert.equal(normalizeMatchText("Boukris SAS"), "boukrissas");
    assert.equal(normalizeMatchText("BÉNJAMIN"), "benjamin");
  });

  it("auto-matches unique full name in counterparty", () => {
    const customers = [
      customer({ id: "1", first_name: "Benjamin", last_name: "Boukris" }),
      customer({ id: "2", first_name: "Alice", last_name: "Martin" }),
    ];
    const result = scoreRevolutMatches(
      { counterparty_name: "BENJAMIN BOUKRIS", reference: null },
      customers
    );
    assert.equal(result.autoCustomerId, "1");
    assert.equal(result.candidates[0]?.reason, "full_name");
  });

  it("auto-matches unique last name only when unique in CRM", () => {
    const customers = [
      customer({ id: "1", first_name: "Benjamin", last_name: "Boukris" }),
      customer({ id: "2", first_name: "Alice", last_name: "Martin" }),
    ];
    const result = scoreRevolutMatches(
      { counterparty_name: "BOUKRIS", reference: "VIR SEPA" },
      customers
    );
    assert.equal(result.autoCustomerId, "1");
    assert.equal(result.candidates[0]?.reason, "unique_last_name");
  });

  it("does not auto-match ambiguous last name", () => {
    const customers = [
      customer({ id: "1", first_name: "Benjamin", last_name: "Dupont" }),
      customer({ id: "2", first_name: "Marie", last_name: "Dupont" }),
    ];
    const result = scoreRevolutMatches(
      { counterparty_name: "DUPONT", reference: null },
      customers
    );
    assert.equal(result.autoCustomerId, null);
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.every((c) => c.score < 90));
  });

  it("auto-matches unique company name", () => {
    const customers = [
      customer({
        id: "1",
        first_name: "Benjamin",
        last_name: "Boukris",
        company_name: "Boukris SAS",
      }),
      customer({ id: "2", first_name: "Alice", last_name: "Martin", company_name: "Autre SARL" }),
    ];
    const result = scoreRevolutMatches(
      { counterparty_name: "BOUKRIS SAS", reference: null },
      customers
    );
    assert.equal(result.autoCustomerId, "1");
    assert.equal(result.candidates[0]?.reason, "company_name");
  });

  it("suggests rows for a given customer", () => {
    const c = customer({
      id: "1",
      first_name: "Benjamin",
      last_name: "Boukris",
      company_name: "Boukris SAS",
    });
    const rows = [
      row({ id: "a", counterparty_name: "BOUKRIS SAS" }),
      row({ id: "b", counterparty_name: "INCONNU SA" }),
      row({ id: "c", counterparty_name: "BOUKRIS", status: "matched" }),
    ];
    const suggestions = suggestionsForCustomer(c, rows);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].row.id, "a");
  });

  it("labels reasons in French", () => {
    assert.equal(matchReasonLabel("company_name"), "Société");
    assert.equal(matchReasonLabel("unique_last_name"), "Nom de famille unique");
  });
});
