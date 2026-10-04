import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRevolutToCustomer,
  ibanMatchKey,
  matchReasonLabel,
  matchTokens,
  normalizeMatchText,
  scoreRevolutMatches,
  suggestedCustomerId,
  suggestionsForCustomer,
  tokensSpell,
  type RevolutMatchCustomer,
} from "./revolut-match";
import type { CrmCustomer, CrmRevolutTransaction } from "./types";

function customer(
  partial: Partial<CrmCustomer> & Pick<CrmCustomer, "id" | "first_name" | "last_name">
): RevolutMatchCustomer {
  return {
    id: partial.id,
    first_name: partial.first_name,
    last_name: partial.last_name,
    company_name: partial.company_name ?? null,
    iban: partial.iban ?? null,
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
    direction: partial.direction || "credit",
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
      row({ id: "d", counterparty_name: "BOUKRIS SAS", direction: "debit" }),
    ];
    const suggestions = suggestionsForCustomer(c, rows);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].row.id, "a");
  });

  it("matches the sender even if the stored name is the designation", () => {
    const customers = [
      customer({
        id: "1",
        first_name: "Benjamin",
        last_name: "Boukris",
        company_name: "Boukris SAS",
      }),
      customer({ id: "2", first_name: "Alice", last_name: "Martin" }),
    ];
    const result = scoreRevolutMatches(
      {
        counterparty_name: "Acompte stage",
        reference: "Acompte stage",
        raw: { legs: [{ description: "Payment from Boukris SAS" }] },
      },
      customers
    );
    assert.equal(result.autoCustomerId, "1");
    assert.equal(result.candidates[0]?.reason, "company_name");
  });

  it("labels reasons in French", () => {
    assert.equal(matchReasonLabel("company_name"), "Société");
    assert.equal(matchReasonLabel("unique_last_name"), "Nom de famille unique");
    assert.equal(matchReasonLabel("iban"), "IBAN du client");
  });

  it("compare des mots entiers, jamais des sous-chaînes", () => {
    assert.deepEqual(matchTokens("Payment from Jean-Pierre MARTINEAU"), ["payment", "from", "jean", "pierre", "martineau"]);
    assert.equal(tokensSpell(["jean", "martineau"], "jeanmartin"), false);
    assert.equal(tokensSpell(["jean", "martin"], "jeanmartin"), true);
    assert.equal(tokensSpell(["jean", "pierre", "martin"], "jeanpierremartin"), true);
    assert.equal(tokensSpell(["le", "roy"], "leroy"), true);
    assert.equal(tokensSpell(["leroy"], "roy"), false);
    assert.equal(tokensSpell(["royal", "hotel"], "roy"), false);
    assert.equal(tokensSpell([], "roy"), false);
    assert.equal(tokensSpell(["roy"], ""), false);
  });

  it("Jean Martineau ne crédite pas Jean Martin", () => {
    const customers = [
      customer({ id: "1", first_name: "Jean", last_name: "Martin" }),
      customer({ id: "2", first_name: "Alice", last_name: "Boukris" }),
    ];
    const result = scoreRevolutMatches({ counterparty_name: "JEAN MARTINEAU", reference: "VIR SEPA" }, customers);
    assert.equal(result.autoCustomerId, null);
    assert.equal(result.candidates.length, 0);
    const exact = scoreRevolutMatches({ counterparty_name: "JEAN MARTIN", reference: null }, customers);
    assert.equal(exact.autoCustomerId, "1");
    assert.equal(exact.candidates[0]?.reason, "full_name");
  });

  it("Roy ne matche ni Leroy ni Royal Hotel, mais Le Roy écrit en deux mots", () => {
    const customers = [
      customer({ id: "1", first_name: "Paul", last_name: "Roy" }),
      customer({ id: "2", first_name: "Alice", last_name: "Boukris" }),
    ];
    for (const name of ["LEROY", "ROYAL HOTEL", "Payment from Leroy Merlin"]) {
      const result = scoreRevolutMatches({ counterparty_name: name, reference: null }, customers);
      assert.equal(result.autoCustomerId, null, name);
      assert.equal(result.candidates.length, 0, name);
    }
    const spaced = scoreRevolutMatches(
      { counterparty_name: "LE ROY", reference: null },
      [customer({ id: "3", first_name: "Paul", last_name: "Le Roy" }), customers[1]]
    );
    assert.equal(spaced.autoCustomerId, "3");
    assert.equal(spaced.candidates[0]?.reason, "unique_last_name");
  });

  it("deux homonymes : aucune présélection", () => {
    const customers = [
      customer({ id: "1", first_name: "Benjamin", last_name: "Dupont" }),
      customer({ id: "2", first_name: "Marie", last_name: "Dupont" }),
    ];
    const result = scoreRevolutMatches({ counterparty_name: "DUPONT", reference: null }, customers);
    assert.equal(result.candidates.length, 2);
    assert.equal(suggestedCustomerId(result.candidates), "");
    assert.equal(result.autoCustomerId, null);
    const twoStrong = scoreRevolutMatches(
      { counterparty_name: "Benjamin Dupont et Marie Dupont", reference: null },
      customers
    );
    assert.ok(twoStrong.candidates.every((c) => c.score === 100));
    assert.equal(suggestedCustomerId(twoStrong.candidates), "");
    assert.equal(twoStrong.autoCustomerId, null);
  });

  it("présélectionne seulement un candidat certain et unique", () => {
    assert.equal(suggestedCustomerId([]), "");
    assert.equal(suggestedCustomerId([{ customer_id: "a", score: 55 }]), "");
    assert.equal(suggestedCustomerId([{ customer_id: "a", score: 80 }, { customer_id: "b", score: 55 }]), "");
    assert.equal(suggestedCustomerId([{ customer_id: "a", score: 90 }, { customer_id: "b", score: 55 }]), "a");
    assert.equal(suggestedCustomerId([{ customer_id: "a", score: 100 }, { customer_id: "b", score: 90 }]), "");
  });

  it("l’IBAN du client l’emporte, espaces et casse ignorés", () => {
    assert.equal(ibanMatchKey("fr76 3000 6000 0112 3456 7890 189"), "FR7630006000011234567890189");
    assert.equal(ibanMatchKey("12345678"), "");
    assert.equal(ibanMatchKey(null), "");
    const customers = [
      customer({ id: "1", first_name: "Benjamin", last_name: "Dupont", iban: "FR76 3000 6000 0112 3456 7890 189" }),
      customer({ id: "2", first_name: "Marie", last_name: "Dupont" }),
    ];
    const result = scoreRevolutMatches(
      { counterparty_name: "DUPONT", reference: "Acompte", counterparty_iban: "fr7630006000011234567890189" },
      customers
    );
    assert.equal(result.autoCustomerId, "1");
    assert.equal(result.candidates[0]?.reason, "iban");
    assert.equal(result.candidates[0]?.score, 100);
    const noName = scoreRevolutMatches(
      { counterparty_name: null, reference: null, counterparty_iban: "FR7630006000011234567890189" },
      customers
    );
    assert.equal(noName.autoCustomerId, "1");
    const otherIban = scoreRevolutMatches(
      { counterparty_name: "DUPONT", reference: null, counterparty_iban: "FR7630006000011234567890999" },
      customers
    );
    assert.equal(otherIban.autoCustomerId, null);
  });

  it("sur la fiche, un homonyme ailleurs dans le CRM retire la certitude", () => {
    const benjamin = customer({ id: "1", first_name: "Benjamin", last_name: "Dupont" });
    const population = [benjamin, customer({ id: "2", first_name: "Marie", last_name: "Dupont" })];
    const rows = [row({ id: "a", counterparty_name: "DUPONT" }), row({ id: "b", counterparty_name: "BENJAMIN DUPONT" })];
    const alone = suggestionsForCustomer(benjamin, rows);
    assert.equal(alone.length, 2);
    assert.ok(alone.every((s) => s.certain));
    const withHomonym = suggestionsForCustomer(benjamin, rows, population);
    assert.equal(withHomonym.length, 2);
    assert.equal(withHomonym.find((s) => s.row.id === "b")?.certain, true);
    assert.equal(withHomonym.find((s) => s.row.id === "a")?.certain, false);
  });

  it("crédite le virement en entier, sans débit de commission", async () => {
    const inserts: { table: string; row: Record<string, unknown> }[] = [];
    const admin = {
      from(table: string) {
        return {
          insert(payload: Record<string, unknown>) {
            inserts.push({ table, row: payload });
            const result = { data: { id: "tx-1", ...payload }, error: null };
            return {
              select() {
                return { single: async () => result };
              },
            };
          },
          update() {
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    };
    const credit = row({
      id: "inbox-1",
      revolut_transaction_id: "rev-1000",
      amount: 1000,
      counterparty_name: "BENJAMIN BOUKRIS",
    });
    const result = await applyRevolutToCustomer(admin, credit, "customer-1");
    assert.equal(result.ok, true);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0]?.table, "crm_transactions");
    assert.equal(inserts[0]?.row.direction, "credit");
    assert.equal(inserts[0]?.row.kind, "transfer");
    assert.equal(inserts[0]?.row.amount, 1000);
    assert.equal(inserts[0]?.row.external_id, "rev-1000");
    assert.equal(
      inserts.some((entry) => String(entry.row.external_id || "").includes("agency-fee")),
      false
    );
  });
});
