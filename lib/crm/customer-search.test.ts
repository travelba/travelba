import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerMatchesQuery,
  customerPickLabel,
  filterCustomersForPick,
  type PickableCustomer,
} from "./customer-search";

function customer(partial: Partial<PickableCustomer>): PickableCustomer {
  return {
    id: "c1",
    first_name: "Marie",
    last_name: "Dupont",
    company_name: null,
    email: "marie@example.com",
    phone: "+33600000000",
    ...partial,
  };
}

describe("customer-search", () => {
  it("affiche le nom puis la société", () => {
    assert.equal(customerPickLabel(customer({})), "Marie Dupont");
    assert.equal(
      customerPickLabel(customer({ company_name: "TBA SAS" })),
      "Marie Dupont · TBA SAS"
    );
  });

  it("cherche sans accent, sur nom, société, e-mail et téléphone", () => {
    const row = customer({
      first_name: "Léa",
      last_name: "Béranger",
      company_name: "Atelier Côte",
      email: "lea@atelier.fr",
      phone: "+33612345678",
    });
    assert.equal(customerMatchesQuery(row, "lea beranger"), true);
    assert.equal(customerMatchesQuery(row, "côte"), true);
    assert.equal(customerMatchesQuery(row, "atelier.fr"), true);
    assert.equal(customerMatchesQuery(row, "061234"), true);
    assert.equal(customerMatchesQuery(row, "inconnu"), false);
  });

  it("place les propositions en tête de liste", () => {
    const a = customer({ id: "a", last_name: "Alpha" });
    const b = customer({ id: "b", first_name: "Paul", last_name: "Beta" });
    const { suggested, rest } = filterCustomersForPick([a, b], "", ["b"]);
    assert.deepEqual(
      suggested.map((c) => c.id),
      ["b"]
    );
    assert.deepEqual(
      rest.map((c) => c.id),
      ["a"]
    );
  });
});
